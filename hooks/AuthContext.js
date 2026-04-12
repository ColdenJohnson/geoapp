import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';  // TODO: for production prefer expo-secure-store for tokens, or similar -- asyncstorage is plain key-value
import auth from '@react-native-firebase/auth';
import { fetchUsersByUID, fetchFriends, fetchFriendRequests, fetchFriendActivity, fetchUserStats, fetchUserTopPhotos } from '@/lib/api';
import {
  DEFAULT_THEME_PREFERENCE,
  getThemePreferenceStorageKey,
  normalizeThemePreference,
} from '@/theme/themePreference';
import { ThemeContext } from '@/hooks/ThemeContext';

export const AuthContext = createContext();
const TOP_PHOTOS_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FRIEND_ACTIVITY_TTL_MS = 10 * 60 * 1000;
const FRIEND_ACTIVITY_PAGE_SIZE = 12;
export const APP_TUTORIAL_STEPS = Object.freeze({
  QUESTS_TAB: 'quests_tab',
  MAP_CREATE: 'map_create',
  FRIENDS_ADD: 'friends_add',
  PROFILE_EDIT: 'profile_edit',
});
const APP_TUTORIAL_STEP_LIST = Object.values(APP_TUTORIAL_STEPS);
const NEW_ACCOUNT_TUTORIAL_WINDOW_MS = 60 * 1000;

function getAppTutorialSeenStorageKey(uid) {
  return `app_tutorial_seen_${uid}`;
}

function getAppTutorialProgressStorageKey(uid) {
  return `app_tutorial_progress_${uid}`;
}

function createAppTutorialVisibilityState(visibleSteps = []) {
  const visibleSet = new Set(Array.isArray(visibleSteps) ? visibleSteps : []);
  return APP_TUTORIAL_STEP_LIST.reduce((accumulator, step) => {
    accumulator[step] = visibleSet.has(step);
    return accumulator;
  }, {});
}

function isTruthyEnvFlag(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function getForcedAppTutorialStep() {
  const debugForcedStep = globalThis.__DEV_FORCE_APP_TUTORIAL_STEP__;
  if (Object.values(APP_TUTORIAL_STEPS).includes(debugForcedStep)) {
    return debugForcedStep;
  }

  const forcedStep = process.env['EXPO_PUBLIC_FORCE_APP_TUTORIAL_STEP'];
  if (Object.values(APP_TUTORIAL_STEPS).includes(forcedStep)) {
    return forcedStep;
  }
  return null;
}

function getForcedAppTutorialVisibility() {
  const forcedStep = getForcedAppTutorialStep();
  if (forcedStep) {
    return createAppTutorialVisibilityState([forcedStep]);
  }
  if (globalThis.__DEV_FORCE_APP_TUTORIAL__ === true || isTruthyEnvFlag(process.env['EXPO_PUBLIC_FORCE_APP_TUTORIAL'])) {
    return createAppTutorialVisibilityState(APP_TUTORIAL_STEP_LIST);
  }
  return null;
}

function getVisibleTutorialSteps(visibilityState) {
  return APP_TUTORIAL_STEP_LIST.filter((step) => visibilityState?.[step]);
}

function parseTutorialProgress(rawValue) {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return null;
    }

    const validSteps = parsed.filter((step) => APP_TUTORIAL_STEP_LIST.includes(step));
    return validSteps.length ? validSteps : [];
  } catch (error) {
    console.warn('Failed to parse app tutorial progress', error);
    return null;
  }
}

function isNewAccountSession(metadata) {
  const createdAtMs = Date.parse(metadata?.creationTime || '');
  const lastSignInAtMs = Date.parse(metadata?.lastSignInTime || '');
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(lastSignInAtMs)) {
    return false;
  }
  return Math.abs(lastSignInAtMs - createdAtMs) <= NEW_ACCOUNT_TUTORIAL_WINDOW_MS;
}

function mergeActivityItems(existingItems, incomingItems) {
  const seen = new Set();
  return [...(Array.isArray(existingItems) ? existingItems : []), ...(Array.isArray(incomingItems) ? incomingItems : [])]
    .filter((item) => {
      const key = item?.id ? String(item.id) : null;
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);           // Firebase user
  const [profile, setProfile] = useState(null);     // Mongo profile
  const [themePreference, setThemePreference] = useState(DEFAULT_THEME_PREFERENCE);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState({ incoming: [], outgoing: [] });
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsDirty, setFriendsDirty] = useState(false);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsDirty, setStatsDirty] = useState(false);
  const [topPhotos, setTopPhotos] = useState([]);
  const [topPhotosLoading, setTopPhotosLoading] = useState(false);
  const [topPhotosDirty, setTopPhotosDirty] = useState(false);
  const [topPhotosFetchedAt, setTopPhotosFetchedAt] = useState(null);
  const [friendActivityItems, setFriendActivityItems] = useState([]);
  const [friendActivitySuggestions, setFriendActivitySuggestions] = useState([]);
  const [friendActivityLoading, setFriendActivityLoading] = useState(false);
  const [friendActivityLoadingMore, setFriendActivityLoadingMore] = useState(false);
  const [friendActivityNextCursor, setFriendActivityNextCursor] = useState(null);
  const [friendActivityFetchedAt, setFriendActivityFetchedAt] = useState(null);
  const [hasUnseenFriendActivity, setHasUnseenFriendActivity] = useState(false);
  const [appTutorialVisibility, setAppTutorialVisibility] = useState(createAppTutorialVisibilityState());
  const appTutorialVisibilityRef = useRef(appTutorialVisibility);
  const preloadRef = useRef({ friends: false, stats: false, topPhotos: false, friendActivity: false });
  const pendingStatsRefreshRef = useRef(false);
  const latestFriendsRef = useRef([]);
  const latestFriendRequestsRef = useRef({ incoming: [], outgoing: [] });
  const friendRequestsInFlightRef = useRef(false);
  const friendRequestsHasLoadedRef = useRef(false);
  const friendActivityInFlightRef = useRef(false);
  const friendActivityHasLoadedRef = useRef(false);

  const friendsCacheKey = (uid) => `friends_cache_${uid}`;
  const statsCacheKey = (uid) => `stats_cache_${uid}`;
  const topPhotosCacheKey = (uid) => `top_photos_cache_${uid}`;

  const prefetchTopPhotoUrls = (photos) => {
    if (!Array.isArray(photos)) return;
    for (const photo of photos) {
      const url = photo?.file_url;
      if (typeof url !== 'string' || !url) continue;
      Image.prefetch(url).catch((error) => {
        console.warn('Failed to prefetch top photo', error);
      });
    }
  };

  useEffect(() => {
    let cancelled = false;

    const applyTokenForUser = async (fbUser) => {
      if (!fbUser) return;
      try {
        const idToken = await fbUser.getIdToken();
        if (cancelled) return;
        setUser((prev) => {
          const base = prev && prev.uid
            ? prev
            : { uid: fbUser.uid, email: fbUser.email ?? null, phoneNumber: fbUser.phoneNumber ?? null }; // if prev (user) is null, then create new base from fbUser
          return { ...base, idToken, isNewAccountSession: isNewAccountSession(fbUser?.metadata) };
        });
        await AsyncStorage.setItem('user_token', idToken);
      } catch (error) {
        console.warn('Failed to hydrate auth token', error);
      }
    };

    const unsubAuth = auth().onAuthStateChanged((fbUser) => {
      if (!fbUser) {
        setUser(null);
        setProfile(null);
        setLoadingAuth(false);
        Promise.resolve(AsyncStorage.removeItem('user_token')).catch((error) => {
          console.warn('Failed to clear auth token from cache', error);
        });
        return;
      }
      setUser({
        uid: fbUser.uid,
        email: fbUser.email ?? null,
        phoneNumber: fbUser.phoneNumber ?? null,
        idToken: null,
        isNewAccountSession: isNewAccountSession(fbUser?.metadata),
      });
      setLoadingAuth(false);
      applyTokenForUser(fbUser);
    });

    const unsubToken = auth().onIdTokenChanged(async (fbUser) => {
      if (fbUser) {
        await applyTokenForUser(fbUser);
      }
    });

    return () => {
      cancelled = true;
      unsubAuth();
      unsubToken();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (user?.uid) {
        setProfile(null);
        const p = await fetchUsersByUID(user.uid);
        if (cancelled) return;
        if (p?.photo_url) {
          Image.prefetch(p.photo_url).catch((error) => {
            console.warn('Failed to prefetch profile photo', error);
          });
        }
        setProfile(p);
      } else {
        setProfile(null);
      }
    }
    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  useEffect(() => {
    let cancelled = false;

    async function loadThemePreference() {
      if (!user?.uid) {
        setThemePreference(DEFAULT_THEME_PREFERENCE);
        return;
      }

      setThemePreference(DEFAULT_THEME_PREFERENCE);

      try {
        const cached = await AsyncStorage.getItem(getThemePreferenceStorageKey(user.uid));
        if (!cancelled) {
          setThemePreference(normalizeThemePreference(cached));
        }
      } catch (error) {
        console.warn('Failed to load cached theme preference', error);
      }
    }

    loadThemePreference();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid || !profile) return;

    const normalizedThemePreference = normalizeThemePreference(profile.theme_preference);
    setThemePreference((prev) => (
      prev === normalizedThemePreference ? prev : normalizedThemePreference
    ));

    Promise.resolve(
      AsyncStorage.setItem(
        getThemePreferenceStorageKey(user.uid),
        normalizedThemePreference
      )
    ).catch((error) => {
      console.warn('Failed to cache theme preference', error);
    });
  }, [profile, user?.uid]);

  useEffect(() => {
    preloadRef.current = { friends: false, stats: false, topPhotos: false, friendActivity: false };
    setTopPhotosDirty(false);
    pendingStatsRefreshRef.current = false;
    latestFriendsRef.current = [];
    latestFriendRequestsRef.current = { incoming: [], outgoing: [] };
    friendRequestsInFlightRef.current = false;
    friendRequestsHasLoadedRef.current = false;
    friendActivityInFlightRef.current = false;
    friendActivityHasLoadedRef.current = false;
    setFriendActivityItems([]);
    setFriendActivitySuggestions([]);
    setFriendActivityLoading(false);
    setFriendActivityLoadingMore(false);
    setFriendActivityNextCursor(null);
    setFriendActivityFetchedAt(null);
    setHasUnseenFriendActivity(!!user?.uid);
    setAppTutorialVisibility(createAppTutorialVisibilityState());
  }, [user?.uid]);

  useEffect(() => {
    let cancelled = false;

    async function syncTutorialState() {
      if (!user?.uid) {
        setAppTutorialVisibility(createAppTutorialVisibilityState());
        return;
      }

      const forcedVisibility = getForcedAppTutorialVisibility();
      if (forcedVisibility) {
        setAppTutorialVisibility(forcedVisibility);
        return;
      }

      try {
        const [hasSeenTutorial, storedProgress] = await Promise.all([
          AsyncStorage.getItem(getAppTutorialSeenStorageKey(user.uid)),
          AsyncStorage.getItem(getAppTutorialProgressStorageKey(user.uid)),
        ]);
        if (cancelled || hasSeenTutorial === 'true') {
          return;
        }

        const visibleSteps = parseTutorialProgress(storedProgress);
        if (visibleSteps) {
          setAppTutorialVisibility(createAppTutorialVisibilityState(visibleSteps));
          return;
        }

        if (!user?.isNewAccountSession) {
          return;
        }

        setAppTutorialVisibility(createAppTutorialVisibilityState(APP_TUTORIAL_STEP_LIST));
        await AsyncStorage.setItem(
          getAppTutorialProgressStorageKey(user.uid),
          JSON.stringify(APP_TUTORIAL_STEP_LIST)
        );
      } catch (error) {
        console.warn('Failed to load app tutorial state', error);
      }
    }

    syncTutorialState();

    return () => {
      cancelled = true;
    };
  }, [user?.isNewAccountSession, user?.uid]);

  useEffect(() => {
    latestFriendsRef.current = friends;
  }, [friends]);

  useEffect(() => {
    latestFriendRequestsRef.current = friendRequests;
  }, [friendRequests]);

  useEffect(() => {
    appTutorialVisibilityRef.current = appTutorialVisibility;
  }, [appTutorialVisibility]);

  useEffect(() => {
    async function loadFriendsCache() {
      if (!user?.uid) {
        setFriends([]);
        setFriendRequests({ incoming: [], outgoing: [] });
        return;
      }
      const raw = await AsyncStorage.getItem(friendsCacheKey(user.uid));
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.friends)) setFriends(parsed.friends);
        if (parsed?.friendRequests) setFriendRequests(parsed.friendRequests);
      } catch (error) {
        console.warn('Failed to parse friends cache', error);
      }
    }
    loadFriendsCache();
  }, [user?.uid]);

  useEffect(() => {
    async function loadStatsCache() {
      if (!user?.uid) {
        setStats(null);
        return;
      }
      const raw = await AsyncStorage.getItem(statsCacheKey(user.uid));
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.stats) setStats(parsed.stats);
      } catch (error) {
        console.warn('Failed to parse stats cache', error);
      }
    }
    loadStatsCache();
  }, [user?.uid]);

  useEffect(() => {
    async function loadTopPhotosCache() {
      if (!user?.uid) {
        setTopPhotos([]);
        setTopPhotosFetchedAt(null);
        return;
      }
      setTopPhotos([]);
      setTopPhotosFetchedAt(null);
      const raw = await AsyncStorage.getItem(topPhotosCacheKey(user.uid));
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        const cachedPhotos = Array.isArray(parsed?.photos) ? parsed.photos : [];
        setTopPhotos(cachedPhotos);
        setTopPhotosFetchedAt(Number.isFinite(parsed?.fetchedAt) ? parsed.fetchedAt : null);
        prefetchTopPhotoUrls(cachedPhotos);
      } catch (error) {
        console.warn('Failed to parse top photos cache', error);
      }
    }
    loadTopPhotosCache();
  }, [user?.uid]);

  async function refreshFriends({ force = false } = {}) {
    if (!user?.uid) return null;
    if (friendsLoading) return null;
    if (!force && !friendsDirty) return null;
    setFriendsLoading(true);
    try {
      const [friendsData, requestsData] = await Promise.all([
        fetchFriends(),
        fetchFriendRequests()
      ]);
      const nextFriends = Array.isArray(friendsData) ? friendsData : [];
      const nextRequests = requestsData || { incoming: [], outgoing: [] };
      setFriends(nextFriends);
      setFriendRequests(nextRequests);
      friendRequestsHasLoadedRef.current = true;
      setFriendsDirty(false);
      await AsyncStorage.setItem(
        friendsCacheKey(user.uid),
        JSON.stringify({ friends: nextFriends, friendRequests: nextRequests })
      );
      return nextFriends;
    } finally {
      setFriendsLoading(false);
    }
  }

  async function refreshFriendRequests({ force = false } = {}) {
    if (!user?.uid) return null;
    if (friendRequestsInFlightRef.current) return null;
    if (!force && friendRequestsHasLoadedRef.current) return latestFriendRequestsRef.current;
    friendRequestsInFlightRef.current = true;
    try {
      const requestsData = await fetchFriendRequests();
      const nextRequests = requestsData || { incoming: [], outgoing: [] };
      setFriendRequests(nextRequests);
      friendRequestsHasLoadedRef.current = true;
      await AsyncStorage.setItem(
        friendsCacheKey(user.uid),
        JSON.stringify({ friends: latestFriendsRef.current, friendRequests: nextRequests })
      );
      return nextRequests;
    } finally {
      friendRequestsInFlightRef.current = false;
    }
  }

  async function refreshFriendActivity({ force = false, showLoading = false } = {}) {
    if (!user?.uid) return null;
    if (friendActivityInFlightRef.current) return null;
    const isStale =
      !Number.isFinite(friendActivityFetchedAt) ||
      Date.now() - friendActivityFetchedAt > FRIEND_ACTIVITY_TTL_MS;
    if (!force && friendActivityHasLoadedRef.current && !isStale) {
      return {
        items: friendActivityItems,
        suggestions: friendActivitySuggestions,
        nextCursor: friendActivityNextCursor,
      };
    }

    friendActivityInFlightRef.current = true;
    if (showLoading) {
      setFriendActivityLoading(true);
    }

    try {
      const payload = await fetchFriendActivity({ limit: FRIEND_ACTIVITY_PAGE_SIZE });
      const nextItems = Array.isArray(payload?.items) ? payload.items : [];
      const nextSuggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
      const nextCursor = payload?.nextCursor || null;
      const fetchedAt = Date.now();

      setFriendActivityItems(nextItems);
      setFriendActivitySuggestions(nextSuggestions);
      setFriendActivityNextCursor(nextCursor);
      setFriendActivityFetchedAt(fetchedAt);
      friendActivityHasLoadedRef.current = true;

      return { items: nextItems, suggestions: nextSuggestions, nextCursor };
    } finally {
      friendActivityInFlightRef.current = false;
      if (showLoading) setFriendActivityLoading(false);
    }
  }

  async function loadMoreFriendActivity() {
    if (!user?.uid) return null;
    if (friendActivityInFlightRef.current) return null;
    if (!friendActivityNextCursor) return null;

    friendActivityInFlightRef.current = true;
    setFriendActivityLoadingMore(true);
    try {
      const payload = await fetchFriendActivity({
        limit: FRIEND_ACTIVITY_PAGE_SIZE,
        cursor: friendActivityNextCursor,
      });
      const nextItems = Array.isArray(payload?.items) ? payload.items : [];
      const nextCursor = payload?.nextCursor || null;

      setFriendActivityItems((prev) => mergeActivityItems(prev, nextItems));
      setFriendActivityNextCursor(nextCursor);
      return { items: nextItems, nextCursor };
    } finally {
      friendActivityInFlightRef.current = false;
      setFriendActivityLoadingMore(false);
    }
  }

  async function refreshStats({ force = false } = {}) {
    if (!user?.uid) return null;
    if (statsLoading) {
      if (force) {
        setStatsDirty(true);
        pendingStatsRefreshRef.current = true;
      }
      return null;
    }
    if (!force && !statsDirty) return null;
    setStatsLoading(true);
    try {
      const data = await fetchUserStats(user.uid);
      if (data) {
        setStats(data);
        setStatsDirty(false);
        await AsyncStorage.setItem(
          statsCacheKey(user.uid),
          JSON.stringify({ stats: data })
        );
      }
      return data;
    } finally {
      setStatsLoading(false);
    }
  }

  async function refreshTopPhotos({ force = false, limit = 2, metric = 'global' } = {}) {
    if (!user?.uid) return null;
    if (topPhotosLoading) return null;
    const isStale =
      !Number.isFinite(topPhotosFetchedAt) ||
      Date.now() - topPhotosFetchedAt > TOP_PHOTOS_CACHE_TTL_MS;
    if (!force && !topPhotosDirty && !isStale) return topPhotos;
    setTopPhotosLoading(true);
    try {
      const rows = await fetchUserTopPhotos(user.uid, { limit, metric });
      const nextPhotos = Array.isArray(rows) ? rows : [];
      const fetchedAt = Date.now();
      setTopPhotos(nextPhotos);
      setTopPhotosDirty(false);
      setTopPhotosFetchedAt(fetchedAt);
      prefetchTopPhotoUrls(nextPhotos);
      await AsyncStorage.setItem(
        topPhotosCacheKey(user.uid),
        JSON.stringify({
          photos: nextPhotos,
          fetchedAt,
          metric: metric === 'local' ? 'local' : 'global',
          limit: Number.isFinite(limit) ? limit : 2,
        })
      );
      return nextPhotos;
    } finally {
      setTopPhotosLoading(false);
    }
  }

  const invalidateFriends = () => {
    setFriendsDirty(true);
    refreshFriends({ force: true });
  };

  const invalidateStats = () => {
    setStatsDirty(true);
    refreshStats({ force: true });
  };

  const invalidateTopPhotos = () => {
    const currentPhotoCount = Number(stats?.photo_count ?? profile?.photo_count ?? 0);
    if (Number.isFinite(currentPhotoCount) && currentPhotoCount < 2) {
      setTopPhotosDirty(true);
    }
  };

  const markFriendActivitySeen = useCallback(() => {
    setHasUnseenFriendActivity(false);
  }, []);

  const isAppTutorialStepVisible = useCallback((step) => {
    return Boolean(appTutorialVisibility?.[step]);
  }, [appTutorialVisibility]);

  const advanceAppTutorial = useCallback(async (expectedStep) => {
    const currentVisibility = appTutorialVisibilityRef.current;
    if (!currentVisibility?.[expectedStep]) {
      return;
    }

    const nextVisibility = {
      ...currentVisibility,
      [expectedStep]: false,
    };
    appTutorialVisibilityRef.current = nextVisibility;
    setAppTutorialVisibility(nextVisibility);

    if (getForcedAppTutorialVisibility() || !user?.uid) {
      return;
    }

    const visibleSteps = getVisibleTutorialSteps(nextVisibility);

    try {
      if (visibleSteps.length > 0) {
        await AsyncStorage.setItem(
          getAppTutorialProgressStorageKey(user.uid),
          JSON.stringify(visibleSteps)
        );
        return;
      }

      await AsyncStorage.setItem(getAppTutorialSeenStorageKey(user.uid), 'true');
      await AsyncStorage.removeItem(getAppTutorialProgressStorageKey(user.uid));
    } catch (error) {
      console.warn('Failed to persist app tutorial state', error);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    if (!preloadRef.current.friends) {
      preloadRef.current.friends = true;
      refreshFriends({ force: true });
    }
    if (!preloadRef.current.stats) {
      preloadRef.current.stats = true;
      refreshStats({ force: true });
    }
    if (!preloadRef.current.topPhotos) {
      preloadRef.current.topPhotos = true;
      refreshTopPhotos({ force: false });
    }
    if (!preloadRef.current.friendActivity) {
      preloadRef.current.friendActivity = true;
      refreshFriendActivity({ force: true, showLoading: false });
    }
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    if (statsLoading) return;
    if (!pendingStatsRefreshRef.current) return;
    pendingStatsRefreshRef.current = false;
    refreshStats({ force: true });
  }, [user?.uid, statsLoading]);

  return (
    <AuthContext.Provider value={{
      user,
      setUser,
      profile,
      setProfile,
      themePreference,
      loadingAuth,
      friends,
      friendRequests,
      friendsLoading,
      stats,
      statsLoading,
      topPhotos,
      topPhotosLoading,
      friendActivityItems,
      friendActivitySuggestions,
      friendActivityLoading,
      friendActivityLoadingMore,
      friendActivityFetchedAt,
      hasUnseenFriendActivity,
      isAppTutorialStepVisible,
      refreshFriends,
      refreshFriendRequests,
      refreshFriendActivity,
      loadMoreFriendActivity,
      markFriendActivitySeen,
      advanceAppTutorial,
      refreshStats,
      refreshTopPhotos,
      invalidateFriends,
      invalidateStats,
      invalidateTopPhotos
    }}>
      <ThemeContext.Provider value={themePreference}>
        {children}
      </ThemeContext.Provider>
    </AuthContext.Provider>
  );
}
