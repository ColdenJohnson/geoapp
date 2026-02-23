import { createContext, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';  // TODO: for production prefer expo-secure-store for tokens, or similar -- asyncstorage is plain key-value
import auth from '@react-native-firebase/auth';
import { fetchUsersByUID, fetchFriends, fetchFriendRequests, fetchUserStats, fetchUserTopPhotos } from '@/lib/api';

export const AuthContext = createContext();
const TOP_PHOTOS_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);           // Firebase user
  const [profile, setProfile] = useState(null);     // Mongo profile
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
  const preloadRef = useRef({ friends: false, stats: false, topPhotos: false });

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
    const unsubAuth = auth().onAuthStateChanged(async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setProfile(null);
        setLoadingAuth(false);
        await AsyncStorage.removeItem('user_token');
        return;
      }
      const idToken = await fbUser.getIdToken(true);
      setUser({
        uid: fbUser.uid,
        email: fbUser.email ?? null,
        phoneNumber: fbUser.phoneNumber ?? null,
        idToken,
      });
      await AsyncStorage.setItem('user_token', idToken);
      setLoadingAuth(false);
    });

    const unsubToken = auth().onIdTokenChanged(async (fbUser) => {
      if (fbUser) {
        const idToken = await fbUser.getIdToken();
        setUser((prev) => {
          const base = prev && prev.uid
            ? prev
            : { uid: fbUser.uid, email: fbUser.email ?? null, phoneNumber: fbUser.phoneNumber ?? null }; // if prev (user) is null, then create new base from fbUser
          return { ...base, idToken };
        });
        await AsyncStorage.setItem('user_token', idToken);
      }
    });

    return () => {
      unsubAuth();
      unsubToken();
    };
  }, []);

  useEffect(() => {
    async function loadProfile() {
      if (user?.uid) {
        const p = await fetchUsersByUID(user.uid);
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
  }, [user?.uid]);

  useEffect(() => {
    preloadRef.current = { friends: false, stats: false, topPhotos: false };
    setTopPhotosDirty(false);
  }, [user?.uid]);

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

  async function refreshStats({ force = false } = {}) {
    if (!user?.uid) return null;
    if (statsLoading) return null;
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
  }, [user?.uid]);

  return (
    <AuthContext.Provider value={{
      user,
      setUser,
      profile,
      setProfile,
      loadingAuth,
      friends,
      friendRequests,
      friendsLoading,
      stats,
      statsLoading,
      topPhotos,
      topPhotosLoading,
      refreshFriends,
      refreshStats,
      refreshTopPhotos,
      invalidateFriends,
      invalidateStats,
      invalidateTopPhotos
    }}>
      {children}
    </AuthContext.Provider>
  );
}
