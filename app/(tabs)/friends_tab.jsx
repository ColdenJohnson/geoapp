import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { APP_TUTORIAL_STEPS, AuthContext } from '@/hooks/AuthContext';
import {
  ensurePushRegistration,
  getNotificationPermissionStatus,
  requestNotificationPermission,
} from '@/hooks/usePushNotifications';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  fetchContactMatches,
  rejectFriendRequest,
  requestFriend,
  searchUserByHandle,
} from '@/lib/api';
import {
  getContactsPermissionStatus,
  inferDefaultCountryFromPhone,
  loadNormalizedContactPhoneNumbers,
  requestContactsPermission,
} from '@/lib/contactDiscovery';
import { buildViewPhotoChallengePhotoRoute, buildViewPhotoChallengeRoute } from '@/lib/navigation';
import { usePalette } from '@/hooks/usePalette';
import { CTAButton, SecondaryButton } from '@/components/ui/Buttons';
import { createFormStyles } from '@/components/ui/FormStyles';
import { Toast, useToast } from '@/components/ui/Toast';
import { radii, spacing } from '@/theme/tokens';
import { textStyles } from '@/theme/typography';

const FRIEND_ACTIVITY_PAGE_SIZE = 12;
const NOTIFICATIONS_INTRO_SEEN_KEY_PREFIX = 'friends_notifications_intro_seen';
const CONTACTS_INTRO_SEEN_KEY_PREFIX = 'friends_contacts_intro_seen';
const PUBLIC_SHARE_BASE_URL =
  process.env.EXPO_PUBLIC_BASE_URL ||
  (Constants?.expoConfig?.extra &&
    (Constants.expoConfig.extra.EXPO_PUBLIC_BASE_URL || Constants.expoConfig.extra.apiBaseUrl)) ||
  'https://geode-backend-834952308922.us-central1.run.app';

function getNotificationsIntroSeenStorageKey(uid) {
  return `${NOTIFICATIONS_INTRO_SEEN_KEY_PREFIX}_${uid}`;
}

function getContactsIntroSeenStorageKey(uid) {
  return `${CONTACTS_INTRO_SEEN_KEY_PREFIX}_${uid}`;
}

function normalizeHandleQuery(value) {
  let trimmed = typeof value === 'string' ? value.trim() : '';
  if (trimmed.startsWith('@')) trimmed = trimmed.slice(1);
  return trimmed;
}

function parseDateMs(value) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function formatRelativeTime(value) {
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - parseDateMs(value)) / 1000));
  if (deltaSeconds < 45) return 'Just now';
  if (deltaSeconds < 3600) return `${Math.max(1, Math.floor(deltaSeconds / 60))}m ago`;
  if (deltaSeconds < 86400) return `${Math.max(1, Math.floor(deltaSeconds / 3600))}h ago`;
  if (deltaSeconds < 604800) return `${Math.max(1, Math.floor(deltaSeconds / 86400))}d ago`;
  return `${Math.max(1, Math.floor(deltaSeconds / 604800))}w ago`;
}

function getDisplayLabel(item) {
  return item?.display_name || item?.actor_display_name || item?.handle || item?.actor_handle || 'Unnamed user';
}

function getHandleLabel(item) {
  const handle = item?.handle || item?.actor_handle || null;
  return handle ? `@${String(handle).replace(/^@/, '')}` : null;
}

function getAvatarInitial(item) {
  const label = getDisplayLabel(item);
  return typeof label === 'string' && label ? label.charAt(0).toUpperCase() : 'A';
}

function getActivityLabel(item) {
  if (item?.type === 'challenge_created') return 'Created Quest';
  if (item?.type === 'challenge_participated') return 'Joined Quest';
  return 'Commented';
}

function UserAvatar({ uri, label, size, styles }) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[
          styles.avatarImage,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
    );
  }

  return (
    <View
      style={[
        styles.avatarFallback,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={styles.avatarFallbackText}>{label}</Text>
    </View>
  );
}

export default function FriendsTabScreen() {
  const {
    user,
    friends,
    friendRequests,
    friendsLoading,
    refreshFriends,
    refreshFriendRequests,
    markFriendActivitySeen,
    friendActivityItems: activityItems,
    friendActivitySuggestions: activitySuggestions,
    friendActivityLoading: activityLoading,
    friendActivityLoadingMore: activityLoadingMore,
    friendActivityFetchedAt,
    refreshFriendActivity,
    loadMoreFriendActivity,
    isAppTutorialStepVisible,
    advanceAppTutorial,
  } = useContext(AuthContext);
  const { handle: sharedHandleParam } = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState('activity');
  const [friendSearchInput, setFriendSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchMessage, setSearchMessage] = useState(null);
  const [searching, setSearching] = useState(false);
  const [friendActionBusy, setFriendActionBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingSuggestionRequests, setPendingSuggestionRequests] = useState({});
  const [optimisticCanceledOutgoingRequests, setOptimisticCanceledOutgoingRequests] = useState({});
  const [notificationsPermissionStatus, setNotificationsPermissionStatus] = useState('undetermined');
  const [notificationsPermissionLoading, setNotificationsPermissionLoading] = useState(false);
  const [notificationsConsentVisible, setNotificationsConsentVisible] = useState(false);
  const [notificationsIntroSeen, setNotificationsIntroSeen] = useState(false);
  const [notificationsIntroHydrated, setNotificationsIntroHydrated] = useState(false);
  const [contactsPermissionStatus, setContactsPermissionStatus] = useState('undetermined');
  const [contactsPermissionLoading, setContactsPermissionLoading] = useState(false);
  const [contactMatches, setContactMatches] = useState([]);
  const [contactMatchesLoading, setContactMatchesLoading] = useState(false);
  const [contactMatchesLoaded, setContactMatchesLoaded] = useState(false);
  const [contactMatchSelection, setContactMatchSelection] = useState({});
  const [contactMatchActionBusy, setContactMatchActionBusy] = useState(false);
  const [contactsConsentVisible, setContactsConsentVisible] = useState(false);
  const [contactsOverlayVisible, setContactsOverlayVisible] = useState(false);
  const [contactsIntroSeen, setContactsIntroSeen] = useState(false);
  const [contactsIntroHydrated, setContactsIntroHydrated] = useState(false);
  const router = useRouter();
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const formStyles = useMemo(() => createFormStyles(colors), [colors]);
  const { message: toastMessage, show: showToast } = useToast(2500);
  const prefilledHandleRef = useRef('');
  const activityHasScrolledRef = useRef(false);
  const friendsPromptsAutoOpenAttemptedRef = useRef(false);
  const sharedHandle = useMemo(
    () => (Array.isArray(sharedHandleParam) ? sharedHandleParam[0] : sharedHandleParam),
    [sharedHandleParam]
  );
  const shareProfileUrl = useMemo(() => {
    if (!user?.uid) return null;
    return `${PUBLIC_SHARE_BASE_URL}/user_profile/${encodeURIComponent(user.uid)}`;
  }, [user?.uid]);
  const defaultContactCountry = useMemo(
    () => inferDefaultCountryFromPhone(user?.phoneNumber),
    [user?.phoneNumber]
  );
  const selectedContactMatchCount = useMemo(
    () => contactMatches.reduce((count, item) => (contactMatchSelection[item?.uid] ? count + 1 : count), 0),
    [contactMatchSelection, contactMatches]
  );

  const pendingIncoming = useMemo(() => (
    [...(friendRequests.incoming || [])].sort((a, b) => parseDateMs(b?.requested_at) - parseDateMs(a?.requested_at))
  ), [friendRequests.incoming]);

  const pendingOutgoing = useMemo(() => (
    [...(friendRequests.outgoing || [])]
      .filter((request) => !optimisticCanceledOutgoingRequests[request?.uid])
      .sort((a, b) => parseDateMs(b?.requested_at) - parseDateMs(a?.requested_at))
  ), [friendRequests.outgoing, optimisticCanceledOutgoingRequests]);

  const recentFriends = useMemo(() => (
    [...friends]
      .sort((a, b) => parseDateMs(b?.accepted_at) - parseDateMs(a?.accepted_at))
      .slice(0, 2)
  ), [friends]);

  const currentFriends = useMemo(() => (
    [...friends].sort((a, b) => getDisplayLabel(a).localeCompare(getDisplayLabel(b)))
  ), [friends]);

  const activityFeedData = useMemo(() => {
    const baseRows = activityItems.map((item) => ({
      key: item.id,
      rowType: 'activity',
      item,
    }));
    const shouldInsertSuggestions = !activityLoading && (baseRows.length > 0 || activitySuggestions.length > 0);

    if (!shouldInsertSuggestions) {
      return baseRows;
    }

    const insertionIndex = Math.min(FRIEND_ACTIVITY_PAGE_SIZE, baseRows.length);
    const suggestionRow = { key: 'activity-suggestions', rowType: 'suggestions' };

    if (baseRows.length === 0) {
      return [suggestionRow];
    }

    return [
      ...baseRows.slice(0, insertionIndex),
      suggestionRow,
      ...baseRows.slice(insertionIndex),
    ];
  }, [activityItems, activityLoading, activitySuggestions]);

  useEffect(() => {
    setNotificationsPermissionStatus('undetermined');
    setNotificationsPermissionLoading(false);
    setNotificationsConsentVisible(false);
    setNotificationsIntroSeen(false);
    setNotificationsIntroHydrated(false);
    setContactsPermissionStatus('undetermined');
    setContactsPermissionLoading(false);
    setContactMatches([]);
    setContactMatchesLoading(false);
    setContactMatchesLoaded(false);
    setContactMatchSelection({});
    setContactMatchActionBusy(false);
    setContactsConsentVisible(false);
    setContactsOverlayVisible(false);
    setContactsIntroSeen(false);
    setContactsIntroHydrated(false);
    friendsPromptsAutoOpenAttemptedRef.current = false;
  }, [user?.uid]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateNotificationsIntroState() {
      if (!user?.uid) {
        if (!cancelled) {
          setNotificationsIntroSeen(true);
          setNotificationsIntroHydrated(true);
        }
        return;
      }

      try {
        const storedValue = await AsyncStorage.getItem(getNotificationsIntroSeenStorageKey(user.uid));
        if (!cancelled) {
          setNotificationsIntroSeen(storedValue === 'true');
          setNotificationsIntroHydrated(true);
        }
      } catch (error) {
        console.error('Failed to hydrate notifications intro state', error);
        if (!cancelled) {
          setNotificationsIntroSeen(false);
          setNotificationsIntroHydrated(true);
        }
      }
    }

    async function hydrateContactsIntroState() {
      if (!user?.uid) {
        if (!cancelled) {
          setContactsIntroSeen(true);
          setContactsIntroHydrated(true);
        }
        return;
      }

      try {
        const storedValue = await AsyncStorage.getItem(getContactsIntroSeenStorageKey(user.uid));
        if (!cancelled) {
          setContactsIntroSeen(storedValue === 'true');
          setContactsIntroHydrated(true);
        }
      } catch (error) {
        console.error('Failed to hydrate contacts intro state', error);
        if (!cancelled) {
          setContactsIntroSeen(false);
          setContactsIntroHydrated(true);
        }
      }
    }

    hydrateNotificationsIntroState();
    hydrateContactsIntroState();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const loadContactMatches = useCallback(async ({ showLoading = true } = {}) => {
    if (!user?.uid) {
      setContactMatches([]);
      setContactMatchesLoaded(false);
      setContactMatchSelection({});
      return [];
    }

    if (showLoading) {
      setContactMatchesLoading(true);
    }

    try {
      console.log('[FriendsTab] Loading contact matches');
      const phoneNumbers = await loadNormalizedContactPhoneNumbers({
        defaultCountry: defaultContactCountry,
      });
      if (!phoneNumbers.length) {
        setContactMatches([]);
        setContactMatchesLoaded(true);
        setContactMatchSelection({});
        return [];
      }

      const matches = await fetchContactMatches({
        phoneNumbers,
        defaultCountry: defaultContactCountry,
      });
      const nextMatches = Array.isArray(matches) ? matches : [];
      setContactMatches(nextMatches);
      setContactMatchesLoaded(true);
      setContactMatchSelection(
        nextMatches.reduce((accumulator, item) => {
          if (item?.uid) {
            accumulator[item.uid] = true;
          }
          return accumulator;
        }, {})
      );
      return nextMatches;
    } catch (error) {
      console.error('Failed to load contact matches', error);
      showToast('Unable to load contact matches right now.', 2500);
      setContactMatches([]);
      setContactMatchesLoaded(true);
      setContactMatchSelection({});
      return [];
    } finally {
      if (showLoading) {
        setContactMatchesLoading(false);
      }
    }
  }, [defaultContactCountry, showToast, user?.uid]);

  const syncContactDiscovery = useCallback(async ({
    requestPermission = false,
    forceReload = false,
    promptIfDenied = false,
  } = {}) => {
    if (!user?.uid) {
      return { status: 'undetermined', matches: [] };
    }

    try {
      const currentStatus = await getContactsPermissionStatus();
      setContactsPermissionStatus(currentStatus);

      let nextStatus = currentStatus;
      if (
        requestPermission
        && (currentStatus === 'undetermined' || (promptIfDenied && currentStatus !== 'granted'))
      ) {
        setContactsPermissionLoading(true);
        try {
          console.log('[FriendsTab] Requesting contacts permission');
          nextStatus = await requestContactsPermission();
          console.log('[FriendsTab] Contacts permission request result', nextStatus);
          setContactsPermissionStatus(nextStatus);
        } finally {
          setContactsPermissionLoading(false);
        }
      }

      if (nextStatus !== 'granted') {
        setContactMatches([]);
        setContactMatchSelection({});
        setContactMatchesLoaded(false);
        return { status: nextStatus, matches: [] };
      }

      const matches = forceReload || !contactMatchesLoaded
        ? await loadContactMatches({ showLoading: true })
        : contactMatches;

      return { status: nextStatus, matches };
    } catch (error) {
      console.error('[FriendsTab] Contact discovery failed', error);
      setContactsPermissionLoading(false);
      setContactMatches([]);
      setContactMatchSelection({});
      setContactMatchesLoaded(false);
      return { status: 'undetermined', matches: [] };
    }
  }, [contactMatches, contactMatchesLoaded, loadContactMatches, user?.uid]);

  const markNotificationsIntroSeen = useCallback(async () => {
    if (!user?.uid) {
      setNotificationsIntroSeen(true);
      return;
    }

    setNotificationsIntroSeen(true);
    try {
      await AsyncStorage.setItem(getNotificationsIntroSeenStorageKey(user.uid), 'true');
    } catch (error) {
      console.error('Failed to persist notifications intro state', error);
    }
  }, [user?.uid]);

  const markContactsIntroSeen = useCallback(async () => {
    if (!user?.uid) {
      setContactsIntroSeen(true);
      return;
    }

    setContactsIntroSeen(true);
    try {
      await AsyncStorage.setItem(getContactsIntroSeenStorageKey(user.uid), 'true');
    } catch (error) {
      console.error('Failed to persist contacts intro state', error);
    }
  }, [user?.uid]);

  const openContactsExperience = useCallback(async ({
    allowDeniedPrompt = false,
    forceIntro = false,
  } = {}) => {
    if (!user?.uid) {
      return false;
    }

    const currentStatus = await getContactsPermissionStatus();
    setContactsPermissionStatus(currentStatus);

    if (currentStatus === 'granted') {
      await markContactsIntroSeen();
      setActiveTab('requests');
      const { status } = await syncContactDiscovery({
        requestPermission: false,
        forceReload: true,
      });
      if (status === 'granted') {
        setContactsOverlayVisible(true);
        return true;
      }
      return false;
    }

    if (forceIntro || !contactsIntroSeen) {
      setContactsConsentVisible(true);
      return true;
    }

    if (allowDeniedPrompt) {
      setContactsConsentVisible(true);
      return true;
    }

    return false;
  }, [contactsIntroSeen, markContactsIntroSeen, syncContactDiscovery, user?.uid]);

  const continueToContactsExperience = useCallback(async () => {
    await openContactsExperience({ allowDeniedPrompt: false, forceIntro: false });
  }, [openContactsExperience]);

  const skipNotificationsIntro = useCallback(async () => {
    setNotificationsConsentVisible(false);
    await markNotificationsIntroSeen();
    await continueToContactsExperience();
  }, [continueToContactsExperience, markNotificationsIntroSeen]);

  const handleNotificationsIntroAllow = useCallback(async () => {
    if (!user?.uid) {
      return;
    }

    setNotificationsConsentVisible(false);
    setNotificationsPermissionLoading(true);
    let nextStatus = 'undetermined';
    try {
      nextStatus = await requestNotificationPermission();
      setNotificationsPermissionStatus(nextStatus);
    } catch (error) {
      console.error('Failed to request notification permission', error);
    } finally {
      setNotificationsPermissionLoading(false);
    }

    await markNotificationsIntroSeen();

    if (nextStatus === 'granted') {
      try {
        await ensurePushRegistration(user);
      } catch (error) {
        console.error('Failed to register push notifications', error);
      }
    }

    await continueToContactsExperience();
  }, [continueToContactsExperience, markNotificationsIntroSeen, user?.uid, user]);

  const openNotificationsExperience = useCallback(async ({
    forceIntro = false,
    continueToContacts = false,
  } = {}) => {
    if (!user?.uid) {
      return false;
    }

    const currentStatus = await getNotificationPermissionStatus();
    setNotificationsPermissionStatus(currentStatus);

    if (currentStatus === 'granted') {
      await markNotificationsIntroSeen();
      if (continueToContacts) {
        await continueToContactsExperience();
      }
      return true;
    }

    if (forceIntro || !notificationsIntroSeen) {
      setNotificationsConsentVisible(true);
      return true;
    }

    if (continueToContacts) {
      await continueToContactsExperience();
      return true;
    }

    return false;
  }, [
    continueToContactsExperience,
    markNotificationsIntroSeen,
    notificationsIntroSeen,
    user?.uid,
  ]);

  const skipContactsOverlay = useCallback(() => {
    setContactsConsentVisible(false);
    setContactsOverlayVisible(false);
    setContactMatchSelection({});
    markContactsIntroSeen();
  }, [markContactsIntroSeen]);

  const requestContactsAndOpenOverlay = useCallback(async ({ allowDeniedPrompt = false } = {}) => {
    if (!user?.uid) {
      return false;
    }

    setContactsConsentVisible(false);
    const { status } = await syncContactDiscovery({
      requestPermission: true,
      forceReload: true,
      promptIfDenied: allowDeniedPrompt,
    });

    await markContactsIntroSeen();

    if (status === 'granted') {
      setActiveTab('requests');
      setContactsOverlayVisible(true);
      return true;
    }

    return false;
  }, [markContactsIntroSeen, syncContactDiscovery, user?.uid]);

  const handleContactsButtonPress = useCallback(async () => {
    await openContactsExperience({ allowDeniedPrompt: true, forceIntro: true });
  }, [openContactsExperience]);

  const handleContactsIntroContinue = useCallback(async () => {
    await requestContactsAndOpenOverlay({ allowDeniedPrompt: true });
  }, [requestContactsAndOpenOverlay]);

  const handleShareProfile = useCallback(async () => {
    if (!shareProfileUrl) {
      Alert.alert('Share Profile', 'Unable to build your profile link right now.');
      return;
    }

    try {
      await Share.share({
        title: 'Add me on SideQuest',
        message: `Let's Quest together. Join me on SideQuest!`,
        url: shareProfileUrl,
      });
    } catch (error) {
      console.warn('Failed to share profile', error);
      Alert.alert('Share Profile', 'Unable to open the share menu right now.');
    }
  }, [shareProfileUrl]);

  const toggleContactMatchSelection = useCallback((uid) => {
    if (!uid) return;
    setContactMatchSelection((prev) => ({ ...prev, [uid]: !prev[uid] }));
  }, []);

  const sendSelectedContactRequests = useCallback(async ({ closeOverlay = false } = {}) => {
    const selectedUids = contactMatches
      .map((item) => item?.uid)
      .filter((uid) => uid && contactMatchSelection[uid]);

    if (!selectedUids.length) {
      return;
    }

    if (closeOverlay) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setContactsOverlayVisible(false);
      markContactsIntroSeen();
    }

    setContactMatchActionBusy(true);
    try {
      const results = await Promise.allSettled(
        selectedUids.map((uid) => requestFriend({ target_uid: uid }))
      );
      const successful = results.filter(
        (result) => result.status === 'fulfilled' && result.value?.success
      ).length;

      if (successful > 0) {
        await Promise.all([
          refreshFriends({ force: true }),
          refreshFriendRequests({ force: true }),
        ]);
        await loadContactMatches({ showLoading: false });
      } else {
        await refreshFriendRequests({ force: true });
      }
    } catch (error) {
      console.error('Failed to send contact friend requests', error);
    } finally {
      setContactMatchActionBusy(false);
    }
  }, [
    contactMatchSelection,
    contactMatches,
    loadContactMatches,
    markContactsIntroSeen,
    refreshFriendRequests,
    refreshFriends,
  ]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    activityHasScrolledRef.current = false;
    const refreshTasks = [
      refreshFriends({ force: true }),
      refreshFriendRequests({ force: true }),
      refreshFriendActivity({ force: true, showLoading: false }),
    ];
    if (contactsPermissionStatus === 'granted') {
      refreshTasks.push(syncContactDiscovery({ forceReload: true }));
    }
    await Promise.all(refreshTasks);
    setPendingSuggestionRequests({});
    setRefreshing(false);
  }, [
    contactsPermissionStatus,
    refreshFriendActivity,
    refreshFriendRequests,
    refreshFriends,
    syncContactDiscovery,
  ]);

  useFocusEffect(
    useCallback(() => () => {
      friendsPromptsAutoOpenAttemptedRef.current = false;
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      markFriendActivitySeen();
      refreshFriendRequests({ force: false });
      if (user?.uid) {
        syncContactDiscovery({
          requestPermission: false,
          forceReload: false,
        }).catch((error) => {
          console.error('Failed to sync contact discovery', error);
        });
      }
      if (
        notificationsIntroHydrated
        && contactsIntroHydrated
        && user?.uid
        && (!notificationsIntroSeen || !contactsIntroSeen)
        && !friendsPromptsAutoOpenAttemptedRef.current
      ) {
        friendsPromptsAutoOpenAttemptedRef.current = true;
        openNotificationsExperience({ forceIntro: false, continueToContacts: true }).catch((error) => {
          console.error('Failed to open friends permission prompts', error);
        });
      }
      refreshFriendActivity({
        force: false,
        showLoading: !friendActivityFetchedAt && !activityItems.length && !activitySuggestions.length,
      });
    }, [
      activityItems.length,
      activitySuggestions.length,
      notificationsIntroHydrated,
      notificationsIntroSeen,
      contactsIntroHydrated,
      contactsIntroSeen,
      friendActivityFetchedAt,
      markFriendActivitySeen,
      openNotificationsExperience,
      refreshFriendActivity,
      refreshFriendRequests,
      syncContactDiscovery,
      user?.uid,
    ])
  );

  useEffect(() => {
    if (!isAppTutorialStepVisible(APP_TUTORIAL_STEPS.FRIENDS_ADD)) {
      return;
    }
    advanceAppTutorial(APP_TUTORIAL_STEPS.FRIENDS_ADD);
  }, [advanceAppTutorial, isAppTutorialStepVisible]);

  const openUserProfile = useCallback((uid) => {
    if (!uid) return;
    router.push({
      pathname: '/user_profile/[uid]',
      params: { uid },
    });
  }, [router]);

  const openChallenge = useCallback((item) => {
    if (!item?.pin_id) return;
    if (!item?.can_open) {
      if (item?.challenge_is_geo_locked) {
        showToast('Unable to open this activity because it is location locked.', 2500);
      }
      return;
    }
    if (item?.comment_text && item?.photo_id) {
      router.push(buildViewPhotoChallengeRoute({
        pinId: item.pin_id,
        message: item.challenge_prompt || '',
        createdByHandle: item.challenge_created_by_handle || '',
      }));
      router.push(buildViewPhotoChallengePhotoRoute({
        pinId: item.pin_id,
        photoId: item.photo_id,
      }));
      return;
    }
    router.push(buildViewPhotoChallengeRoute({
      pinId: item.pin_id,
      message: item.challenge_prompt || '',
      createdByHandle: item.challenge_created_by_handle || '',
    }));
  }, [router, showToast]);

  const runFriendSearch = useCallback(async (query, { showLoading = false, allowShort = false } = {}) => {
    const trimmed = normalizeHandleQuery(query ?? friendSearchInput);
    if (!allowShort && trimmed.length < 3) {
      setSearchResults([]);
      setSearchMessage(null);
      return;
    }
    if (!trimmed) {
      setSearchResults([]);
      setSearchMessage(null);
      return;
    }

    if (showLoading) setSearching(true);
    setSearchMessage(null);
    const results = await searchUserByHandle(trimmed);
    if (results.length) {
      setSearchResults(results.slice(0, 3));
    } else {
      setSearchResults([]);
      setSearchMessage('No users found.');
    }
    if (showLoading) setSearching(false);
  }, [friendSearchInput]);

  useEffect(() => {
    const trimmed = normalizeHandleQuery(friendSearchInput);
    if (trimmed.length < 3) {
      setSearchResults([]);
      setSearchMessage(null);
      return;
    }
    const timer = globalThis.setTimeout(() => {
      runFriendSearch(trimmed, { showLoading: false });
    }, 250);
    return () => globalThis.clearTimeout(timer);
  }, [friendSearchInput, runFriendSearch]);

  useEffect(() => {
    const normalized = normalizeHandleQuery(sharedHandle);
    if (!normalized || normalized === prefilledHandleRef.current) return;
    prefilledHandleRef.current = normalized;
    setFriendSearchInput(normalized);
    runFriendSearch(normalized, { showLoading: true, allowShort: true });
  }, [runFriendSearch, sharedHandle]);

  const runFriendSearchImmediate = useCallback(() => {
    runFriendSearch(friendSearchInput, { showLoading: true, allowShort: true });
  }, [friendSearchInput, runFriendSearch]);

  const sendFriendRequest = useCallback(async ({ handle, targetUid, clearSearch = false } = {}) => {
    if (!handle && !targetUid) return;
    setFriendActionBusy(true);
    const resp = await requestFriend({ handle, target_uid: targetUid });
    if (resp?.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (targetUid) {
        setOptimisticCanceledOutgoingRequests((prev) => {
          if (!prev[targetUid]) return prev;
          const next = { ...prev };
          delete next[targetUid];
          return next;
        });
        setPendingSuggestionRequests((prev) => ({ ...prev, [targetUid]: true }));
      }
      setSearchMessage(
        resp?.status === 'pending' ? 'Friend request sent.' : 'Request updated.'
      );
      await refreshFriendRequests({ force: true });
      if (clearSearch) {
        setSearchResults([]);
        setFriendSearchInput('');
      }
    } else {
      if (targetUid) {
        setPendingSuggestionRequests((prev) => {
          const next = { ...prev };
          delete next[targetUid];
          return next;
        });
      }
      Alert.alert('Friend Request', resp?.error || 'Failed to send friend request.');
    }
    setFriendActionBusy(false);
  }, [refreshFriendRequests]);

  const acceptRequest = useCallback(async (uid) => {
    if (!uid) return;
    setFriendActionBusy(true);
    const resp = await acceptFriendRequest(uid);
    if (resp?.success) {
      activityHasScrolledRef.current = false;
      await Promise.all([
        refreshFriends({ force: true }),
        refreshFriendActivity({ force: true, showLoading: false }),
      ]);
    } else {
      Alert.alert('Friend Request', resp?.error || 'Failed to accept friend request.');
    }
    setFriendActionBusy(false);
  }, [refreshFriendActivity, refreshFriends]);

  const rejectRequest = useCallback(async (uid) => {
    if (!uid) return;
    setFriendActionBusy(true);
    const resp = await rejectFriendRequest(uid);
    if (!resp?.success) {
      Alert.alert('Friend Request', resp?.error || 'Failed to delete friend request.');
    }
    setFriendActionBusy(false);
  }, []);

  const cancelRequest = useCallback(async (uid) => {
    if (!uid) return;
    setOptimisticCanceledOutgoingRequests((prev) => ({ ...prev, [uid]: true }));
    setFriendActionBusy(true);
    const resp = await cancelFriendRequest(uid);
    if (resp?.success) {
      setPendingSuggestionRequests((prev) => {
        if (!prev[uid]) return prev;
        const next = { ...prev };
        delete next[uid];
        return next;
      });
      await refreshFriendRequests({ force: true });
    } else {
      setOptimisticCanceledOutgoingRequests((prev) => {
        if (!prev[uid]) return prev;
        const next = { ...prev };
        delete next[uid];
        return next;
      });
      Alert.alert('Friend Request', resp?.error || 'Failed to cancel friend request.');
    }
    setFriendActionBusy(false);
  }, [refreshFriendRequests]);

  const renderUserRow = useCallback((item, {
    keyPrefix,
    rightAction = null,
    metaText = null,
    rowMuted = false,
  } = {}) => {
    if (!item?.uid) return null;
    const handleLabel = getHandleLabel(item);
    const secondaryMeta = metaText || null;

    return (
      <View key={`${keyPrefix}-${item.uid}-${item.handle || 'row'}`} style={[styles.personRow, rowMuted && styles.personRowMuted]}>
        <Pressable
          onPress={() => openUserProfile(item.uid)}
          style={({ pressed }) => [styles.personPressable, pressed && styles.pressed]}
        >
          <View style={styles.personContent}>
            <UserAvatar
              uri={item.photo_url || null}
              label={getAvatarInitial(item)}
              size={46}
              styles={styles}
            />
            <View style={styles.personTextWrap}>
              <Text style={styles.personName}>{getDisplayLabel(item)}</Text>
              {handleLabel ? <Text style={styles.personMeta}>{handleLabel}</Text> : null}
              {secondaryMeta ? <Text style={styles.personMetaSecondary}>{secondaryMeta}</Text> : null}
            </View>
          </View>
        </Pressable>
        {rightAction ? <View style={styles.personAction}>{rightAction(item)}</View> : null}
      </View>
    );
  }, [openUserProfile, styles]);

  const renderRequestRows = useCallback((title, items, type) => (
    items.map((item) => renderUserRow(item, {
      keyPrefix: title,
      rowMuted: type === 'outgoing',
      metaText: type === 'incoming' ? formatRelativeTime(item?.requested_at) : `Pending ${formatRelativeTime(item?.requested_at)}`,
      rightAction: type === 'incoming'
        ? (request) => (
            <View style={styles.inlineActionRow}>
              <CTAButton
                title="Accept"
                onPress={() => acceptRequest(request.uid)}
                variant="filled"
                style={styles.smallButton}
                textStyle={styles.smallButtonText}
                disabled={friendActionBusy}
              />
              <SecondaryButton
                title="Delete"
                onPress={() => rejectRequest(request.uid)}
                style={styles.smallButton}
                textStyle={styles.smallButtonText}
                disabled={friendActionBusy}
              />
            </View>
          )
        : (request) => (
            <SecondaryButton
              title="Cancel"
              onPress={() => cancelRequest(request.uid)}
              style={styles.smallButton}
              textStyle={styles.smallButtonText}
              disabled={friendActionBusy}
            />
          ),
    }))
  ), [
    acceptRequest,
    cancelRequest,
    friendActionBusy,
    rejectRequest,
    renderUserRow,
    styles,
  ]);

  const renderRequestSection = useCallback((title, items, type) => (
    <View style={[formStyles.card, styles.sectionCard]}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{items.length}</Text>
      </View>
      {friendsLoading && !items.length ? (
        <View style={styles.centerRow}>
          <ActivityIndicator size="small" color={colors.text} />
        </View>
      ) : !items.length ? (
        <Text style={styles.emptyText}>
          {type === 'incoming' ? 'No incoming requests.' : 'No outgoing requests.'}
        </Text>
      ) : (
        renderRequestRows(title, items, type)
      )}
    </View>
  ), [
    colors.text,
    formStyles.card,
    friendsLoading,
    renderRequestRows,
    styles,
  ]);

  const renderTopChrome = useCallback(() => (
    <>
      <Text style={styles.pageTitle}>Friends</Text>

      <View style={styles.segmentedControl}>
        <Pressable
          onPress={() => setActiveTab('activity')}
          style={({ pressed }) => [
            styles.segmentButton,
            activeTab === 'activity' && styles.segmentButtonActive,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.segmentText, activeTab === 'activity' && styles.segmentTextActive]}>Activity</Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('requests')}
          style={({ pressed }) => [
            styles.segmentButton,
            activeTab === 'requests' && styles.segmentButtonActive,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.segmentText, activeTab === 'requests' && styles.segmentTextActive]}>Friends</Text>
          {pendingIncoming.length > 0 ? <View style={styles.segmentBadge} /> : null}
        </Pressable>
      </View>
    </>
  ), [activeTab, pendingIncoming.length, styles]);

  const renderSearchSection = useCallback(({ compact = false } = {}) => (
    <View style={compact ? styles.searchSectionCompact : [formStyles.card, styles.sectionCard]}>
      {compact ? null : (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Search</Text>
        </View>
      )}
      <TextInput
        style={[formStyles.input, compact ? styles.searchInputCompact : styles.searchInput]}
        placeholder="Add friends by handle"
        value={friendSearchInput}
        onChangeText={setFriendSearchInput}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={runFriendSearchImmediate}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.primary}
        cursorColor={colors.text}
        testID="friends-search-input"
      />
      {searching ? (
        <View style={styles.centerRow}>
          <ActivityIndicator size="small" color={colors.text} />
        </View>
      ) : searchResults.length ? (
        <View style={styles.stackSection}>
          {searchResults.map((result) => renderUserRow(result, {
            keyPrefix: 'search',
            rightAction: (user) => (
              <CTAButton
                title="Add"
                onPress={() => sendFriendRequest({ handle: user.handle, clearSearch: true })}
                variant="filled"
                style={styles.smallButton}
                textStyle={styles.smallButtonText}
                disabled={friendActionBusy}
              />
            ),
          }))}
        </View>
      ) : searchMessage ? (
        <Text style={styles.emptyText}>{searchMessage}</Text>
      ) : null}
    </View>
  ), [
    colors.primary,
    colors.text,
    colors.textMuted,
    formStyles.card,
    formStyles.input,
    friendActionBusy,
    friendSearchInput,
    renderUserRow,
    runFriendSearchImmediate,
    searchMessage,
    searchResults,
    searching,
    sendFriendRequest,
    styles,
  ]);

  const renderContactMatchRow = useCallback((item) => {
    if (!item?.uid) return null;
    const isSelected = !!contactMatchSelection[item.uid];
    const handleLabel = getHandleLabel(item);

    return (
      <View key={`contact-match-${item.uid}`} style={styles.contactMatchRow}>
        <Switch
          value={isSelected}
          onValueChange={() => toggleContactMatchSelection(item.uid)}
          disabled={contactMatchActionBusy}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.bg}
          style={styles.contactSwitch}
        />

        <Pressable
          onPress={() => openUserProfile(item.uid)}
          style={({ pressed }) => [styles.contactMatchPressable, pressed && styles.pressed]}
        >
          <View style={styles.personContent}>
            <UserAvatar
              uri={item.photo_url || null}
              label={getAvatarInitial(item)}
              size={46}
              styles={styles}
            />
            <View style={styles.personTextWrap}>
              <Text style={styles.personName}>{getDisplayLabel(item)}</Text>
              {handleLabel ? <Text style={styles.personMeta}>{handleLabel}</Text> : null}
            </View>
          </View>
        </Pressable>
      </View>
    );
  }, [
    colors.bg,
    colors.primary,
    colors.border,
    contactMatchActionBusy,
    contactMatchSelection,
    openUserProfile,
    styles,
    toggleContactMatchSelection,
  ]);

  const renderContactsSection = useCallback(() => (
    <View style={styles.contactsSection}>
      <Pressable
        onPress={handleContactsButtonPress}
        style={({ pressed }) => [
          styles.contactsEntryPressable,
          (contactsPermissionLoading || contactMatchesLoading || contactMatchActionBusy) && styles.contactsEntryPressableDisabled,
          pressed && styles.sharePressablePressed,
        ]}
        disabled={contactsPermissionLoading || contactMatchesLoading || contactMatchActionBusy}
      >
        <Text style={styles.contactsEntryButtonText}>
          {contactsPermissionLoading || contactMatchesLoading ? 'Loading Contacts...' : 'Add From Contacts'}
        </Text>
      </Pressable>
    </View>
  ), [
    contactMatchActionBusy,
    contactMatchesLoading,
    contactsPermissionLoading,
    handleContactsButtonPress,
    styles,
  ]);

  const renderNotificationsConsentOverlay = useCallback(() => (
    <Modal
      visible={notificationsConsentVisible}
      transparent={false}
      animationType="fade"
      onRequestClose={() => {}}
    >
      <SafeAreaView style={styles.modalScreen}>
        <View style={styles.contactsConsentCard} testID="notifications-consent-overlay">
          <View style={styles.contactsConsentContent}>
            <Text style={styles.contactsConsentTitle}>Allow notifications</Text>
            <Text style={styles.contactsConsentBody}>
              We promise we won&apos;t spam you. This is just to let you know when people upload to
              your quests or comment on your photos!
            </Text>
          </View>

          <View style={styles.contactsConsentFooter}>
            <SecondaryButton
              title="Skip"
              onPress={skipNotificationsIntro}
              style={styles.contactsConsentSkipButton}
              textStyle={styles.smallButtonText}
            />
            <CTAButton
              title="Allow"
              onPress={handleNotificationsIntroAllow}
              variant="filled"
              style={styles.contactsConsentContinueButton}
              disabled={notificationsPermissionLoading}
              loading={notificationsPermissionLoading}
            />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  ), [
    handleNotificationsIntroAllow,
    notificationsConsentVisible,
    notificationsPermissionLoading,
    skipNotificationsIntro,
    styles,
  ]);

  const renderContactsConsentOverlay = useCallback(() => (
    <Modal
      visible={contactsConsentVisible}
      transparent={false}
      animationType="fade"
      onRequestClose={() => {}}
    >
      <SafeAreaView style={styles.modalScreen}>
        <View style={styles.contactsConsentCard} testID="contacts-consent-overlay">
          <View style={styles.contactsConsentContent}>
            <Text style={styles.contactsConsentTitle}>See if any friends are SideQuesting</Text>
            <Text style={styles.contactsConsentBody}>
              This information is not stored on our servers or sent anywhere. We only use it one
              time to check whether any of your contacts are already on SideQuest.
            </Text>
          </View>

          <View style={styles.contactsConsentFooter}>
            <SecondaryButton
              title="Skip"
              onPress={skipContactsOverlay}
              style={styles.contactsConsentSkipButton}
              textStyle={styles.smallButtonText}
            />
            <CTAButton
              title="Continue"
              onPress={handleContactsIntroContinue}
              variant="filled"
              style={styles.contactsConsentContinueButton}
              disabled={contactsPermissionLoading}
              loading={contactsPermissionLoading}
            />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  ), [
    contactsConsentVisible,
    contactsPermissionLoading,
    handleContactsIntroContinue,
    skipContactsOverlay,
    styles,
  ]);

  const renderContactsOverlay = useCallback(() => (
    <Modal
      visible={contactsOverlayVisible}
      transparent={false}
      animationType="fade"
      onRequestClose={() => {}}
    >
      <SafeAreaView style={styles.modalScreen}>
        <View style={styles.modalCard} testID="contacts-overlay">
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalTitle}>Add friends from contacts</Text>
            <Text style={styles.sectionCount}>{contactMatches.length}</Text>
          </View>

          <View style={styles.modalListWrap}>
            {contactMatchesLoading && !contactMatchesLoaded ? (
              <View style={styles.centerRowTall}>
                <ActivityIndicator size="small" color={colors.text} />
              </View>
            ) : !contactMatches.length ? (
              <View style={styles.centerRowTall}>
                <Text style={styles.emptyText}>No SideQuest profiles from your contacts were found yet.</Text>
              </View>
            ) : (
              <ScrollView
                style={styles.modalList}
                contentContainerStyle={styles.modalListContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {contactMatches.map((item) => renderContactMatchRow(item))}
              </ScrollView>
            )}
          </View>

          <Pressable
            onPress={handleShareProfile}
            style={({ pressed }) => [
              styles.modalSharePressable,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.modalSharePressableText}>Invite</Text>
          </Pressable>

          <View style={styles.modalFooter}>
            <CTAButton
              title="Skip"
              onPress={skipContactsOverlay}
              style={styles.footerSkipButton}
              textStyle={styles.footerSkipButtonText}
            />
            <CTAButton
              title={contactMatchActionBusy ? 'Adding...' : `Add (${selectedContactMatchCount})`}
              onPress={() => sendSelectedContactRequests({ closeOverlay: true })}
              variant="filled"
              style={styles.footerSendButton}
              disabled={contactMatchActionBusy || selectedContactMatchCount === 0}
            />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  ), [
    colors.text,
    contactMatchActionBusy,
    contactMatches,
    contactMatchesLoading,
    contactMatchesLoaded,
    contactsOverlayVisible,
    handleShareProfile,
    renderContactMatchRow,
    selectedContactMatchCount,
    sendSelectedContactRequests,
    skipContactsOverlay,
    styles,
  ]);

  const activityListHeader = useMemo(() => (
    <View>
      {renderTopChrome()}
      {renderSearchSection({ compact: true })}

      {pendingIncoming.length ? (
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderStandalone}>
            <Text style={[styles.sectionTitle, styles.sectionTitlePrimary]}>Pending Requests</Text>
            <Text style={styles.sectionCount}>{pendingIncoming.length}</Text>
          </View>
          <View style={styles.sectionRows}>
            {renderRequestRows('Pending Requests', pendingIncoming, 'incoming')}
          </View>
        </View>
      ) : null}

      <View style={styles.sectionHeaderStandalone}>
        <Text style={[styles.sectionTitle, styles.sectionTitlePrimary]}>Friend Activity</Text>
        <Text style={styles.sectionCount}>{activityItems.length}</Text>
      </View>
    </View>
  ), [
    activityItems.length,
    pendingIncoming,
    renderRequestRows,
    renderSearchSection,
    renderTopChrome,
    styles,
  ]);

  const renderActivityRow = useCallback(({ item: row }) => {
    if (row?.rowType === 'suggestions') {
      return (
        <View style={[formStyles.card, styles.sectionCard]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Suggested For You</Text>
            <Text style={styles.sectionCount}>{activitySuggestions.length}</Text>
          </View>
          {!activitySuggestions.length ? (
            <Text style={styles.emptyText}>No suggestions right now.</Text>
          ) : (
            activitySuggestions.map((item) => {
              const requestPending = !!pendingSuggestionRequests[item?.uid]
                || pendingOutgoing.some((request) => request?.uid === item?.uid);
              return renderUserRow(item, {
                keyPrefix: 'suggestion',
                rowMuted: requestPending,
                metaText: item?.mutual_count ? `${item.mutual_count} mutual ${item.mutual_count === 1 ? 'friend' : 'friends'}` : null,
                rightAction: (suggestion) => {
                  if (requestPending) {
                    return (
                      <CTAButton
                        title="Request Pending"
                        variant="secondary"
                        style={styles.smallButton}
                        textStyle={styles.smallButtonText}
                        disabled={true}
                      />
                    );
                  }

                  return (
                    <CTAButton
                      title="Add"
                      onPress={() => sendFriendRequest({ targetUid: suggestion.uid })}
                      variant="filled"
                      style={styles.smallButton}
                      textStyle={styles.smallButtonText}
                      disabled={friendActionBusy}
                    />
                  );
                },
              });
            })
          )}
        </View>
      );
    }

    const item = row?.item;
    const handleLabel = getHandleLabel({ handle: item?.actor_handle });
    const showQuestPhoto = !item?.comment_text && !!item?.challenge_photo_url;

    return (
      <View style={styles.activityEntry}>
        <Pressable
          onPress={() => openUserProfile(item?.actor_uid)}
          style={({ pressed }) => [styles.activityUserPressable, pressed && styles.pressed]}
        >
          <UserAvatar
            uri={item?.actor_photo_url || null}
            label={getAvatarInitial({ display_name: item?.actor_display_name, handle: item?.actor_handle })}
            size={42}
            styles={styles}
          />
          <View style={styles.activityHeaderText}>
            <View style={styles.activityMetaRow}>
              <Text style={styles.activityHeadlineName}>{handleLabel || item?.actor_display_name || 'Someone'}</Text>
              <Text style={styles.activityMetaDot}>•</Text>
              <Text style={styles.activityTimestamp}>{formatRelativeTime(item?.created_at)}</Text>
            </View>
            <Text style={styles.activityHeadline}>{getActivityLabel(item)}</Text>
          </View>
        </Pressable>

        <Pressable
          disabled={!item?.pin_id}
          onPress={() => openChallenge(item)}
          style={({ pressed }) => [
            styles.activityContent,
            item?.comment_text && styles.activityContentComment,
            !item?.can_open && styles.activityBodyStatic,
            item?.pin_id && pressed && styles.pressed,
          ]}
        >
          {showQuestPhoto ? (
            <Image
              source={{ uri: item.challenge_photo_url }}
              style={styles.activityImage}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : null}
          <Text style={styles.activityPrompt}>{item?.challenge_prompt}</Text>
          {item?.comment_text ? <Text style={styles.activityComment}>"{item.comment_text}"</Text> : null}
        </Pressable>
      </View>
    );
  }, [
    activitySuggestions,
    formStyles.card,
    friendActionBusy,
    openChallenge,
    openUserProfile,
    pendingOutgoing,
    pendingSuggestionRequests,
    renderUserRow,
    sendFriendRequest,
    styles,
  ]);

  const renderActivityEmpty = useCallback(() => {
    if (activityLoading) {
      return (
        <View style={styles.centerRowTall}>
          <ActivityIndicator size="small" color={colors.text} />
        </View>
      );
    }

    return (
      <View style={styles.emptyStateWrap}>
        <Text style={styles.emptyText}>No recent activity yet.</Text>
      </View>
    );
  }, [activityLoading, colors.text, styles]);

  const renderActivityListFooter = useCallback(() => (
    <View style={styles.activityFooter}>
      {activityLoadingMore ? (
        <View style={styles.centerRow}>
          <ActivityIndicator size="small" color={colors.text} />
        </View>
      ) : null}
    </View>
  ), [activityLoadingMore, colors.text, styles]);

  const onActivityEndReached = useCallback(() => {
    if (!activityHasScrolledRef.current) return;
    loadMoreFriendActivity();
  }, [loadMoreFriendActivity]);

  const renderRequestsContent = () => (
    <>
      {renderContactsSection()}
      {renderSearchSection({ compact: true })}

      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeaderStandalone}>
          <Text style={[styles.sectionTitle, styles.sectionTitlePrimary]}>Recently Added</Text>
          <Text style={styles.sectionCount}>{recentFriends.length}</Text>
        </View>
        {friendsLoading && !recentFriends.length ? (
          <View style={styles.centerRow}>
            <ActivityIndicator size="small" color={colors.text} />
          </View>
        ) : !recentFriends.length ? (
          <Text style={styles.emptyText}>No friends yet.</Text>
        ) : (
          <View style={styles.sectionRows}>
            {recentFriends.map((item) => renderUserRow(item, {
              keyPrefix: 'recent',
              metaText: formatRelativeTime(item?.accepted_at),
            }))}
          </View>
        )}
      </View>

      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeaderStandalone}>
          <Text style={[styles.sectionTitle, styles.sectionTitlePrimary]}>Incoming Requests</Text>
          <Text style={styles.sectionCount}>{pendingIncoming.length}</Text>
        </View>
        {friendsLoading && !pendingIncoming.length ? (
          <View style={styles.centerRow}>
            <ActivityIndicator size="small" color={colors.text} />
          </View>
        ) : !pendingIncoming.length ? (
          <Text style={styles.emptyText}>No incoming requests.</Text>
        ) : (
          <View style={styles.sectionRows}>
            {renderRequestRows('Incoming Requests', pendingIncoming, 'incoming')}
          </View>
        )}
      </View>

      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeaderStandalone}>
          <Text style={[styles.sectionTitle, styles.sectionTitlePrimary]}>Outgoing Requests</Text>
          <Text style={styles.sectionCount}>{pendingOutgoing.length}</Text>
        </View>
        {friendsLoading && !pendingOutgoing.length ? (
          <View style={styles.centerRow}>
            <ActivityIndicator size="small" color={colors.text} />
          </View>
        ) : !pendingOutgoing.length ? (
          <Text style={styles.emptyText}>No outgoing requests.</Text>
        ) : (
          <View style={styles.sectionRows}>
            {renderRequestRows('Outgoing Requests', pendingOutgoing, 'outgoing')}
          </View>
        )}
      </View>

      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeaderStandalone}>
          <Text style={[styles.sectionTitle, styles.sectionTitlePrimary]}>Current Friends</Text>
          <Text style={styles.sectionCount}>{currentFriends.length}</Text>
        </View>
        {friendsLoading && !currentFriends.length ? (
          <View style={styles.centerRow}>
            <ActivityIndicator size="small" color={colors.text} />
          </View>
        ) : !currentFriends.length ? (
          <Text style={styles.emptyText}>No friends yet.</Text>
        ) : (
          <View style={styles.sectionRows}>
            {currentFriends.map((item) => renderUserRow(item, { keyPrefix: 'friend' }))}
          </View>
        )}
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {activeTab === 'activity' ? (
          <FlatList
            data={activityFeedData}
            keyExtractor={(item) => item.key}
            renderItem={renderActivityRow}
            ListHeaderComponent={activityListHeader}
            ListEmptyComponent={renderActivityEmpty}
            ListFooterComponent={renderActivityListFooter}
            contentContainerStyle={[styles.content, { paddingBottom: spacing['4xl'] }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            refreshControl={<RefreshControl refreshing={refreshing || friendsLoading} onRefresh={onRefresh} />}
            onEndReached={onActivityEndReached}
            onEndReachedThreshold={0.45}
            onScrollBeginDrag={() => {
              activityHasScrolledRef.current = true;
            }}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={5}
            removeClippedSubviews={Platform.OS === 'android'}
          />
        ) : (
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: spacing['4xl'] }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            refreshControl={<RefreshControl refreshing={refreshing || friendsLoading} onRefresh={onRefresh} />}
          >
            {renderTopChrome()}
            {renderRequestsContent()}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
      {renderNotificationsConsentOverlay()}
      {renderContactsConsentOverlay()}
      {renderContactsOverlay()}
      <Toast message={toastMessage} bottomOffset={spacing.xl} />
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    keyboardWrap: {
      flex: 1,
    },
    content: {
      flexGrow: 1,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing['2xl'],
      width: '100%',
      maxWidth: 520,
      alignSelf: 'center',
    },
    pageTitle: {
      ...textStyles.pageTitle,
      color: colors.primary,
      letterSpacing: 0.3,
      marginBottom: spacing.lg,
    },
    segmentedControl: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 4,
      borderRadius: radii.lg,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.lg,
    },
    segmentButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    segmentButtonActive: {
      backgroundColor: colors.surface,
    },
    segmentText: {
      ...textStyles.sectionTitleSm,
      color: colors.textMuted,
      letterSpacing: 0.9,
    },
    segmentTextActive: {
      color: colors.primary,
    },
    segmentBadge: {
      position: 'absolute',
      top: 8,
      right: 22,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    sectionCard: {
      marginBottom: spacing.lg,
      position: 'relative',
      overflow: 'visible',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    sectionHeaderStandalone: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
      paddingHorizontal: 2,
    },
    sectionBlock: {
      marginBottom: spacing.lg,
    },
    sectionRows: {
      paddingHorizontal: 2,
    },
    sectionTitle: {
      ...textStyles.sectionTitle,
      color: colors.text,
    },
    sectionTitlePrimary: {
      color: colors.primary,
    },
    sectionCount: {
      ...textStyles.sectionTitleSm,
      color: colors.textMuted,
      letterSpacing: 0.8,
    },
    searchSectionCompact: {
      marginBottom: spacing.lg,
    },
    searchInput: {
      marginTop: 2,
    },
    searchInputCompact: {
      marginTop: 0,
    },
    stackSection: {
      marginTop: spacing.sm,
    },
    contactsSection: {
      marginBottom: spacing.lg,
    },
    contactsEntryPressable: {
      alignSelf: 'stretch',
      minHeight: 40,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radii.round,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    contactsEntryPressableDisabled: {
      opacity: 0.55,
    },
    contactsEntryButtonText: {
      ...textStyles.buttonSmall,
      color: colors.primary,
      letterSpacing: 0.4,
    },
    contactMatchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    contactSwitch: {
      marginRight: 2,
    },
    contactMatchPressable: {
      flex: 1,
    },
    personRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.md - 2,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: spacing.md,
    },
    personRowMuted: {
      opacity: 0.7,
    },
    personPressable: {
      flex: 1,
    },
    personContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    personTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    personName: {
      ...textStyles.bodyStrong,
      color: colors.text,
    },
    personMeta: {
      ...textStyles.bodySmallStrong,
      color: colors.primary,
      marginTop: 3,
    },
    personMetaSecondary: {
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
      marginTop: 3,
    },
    personAction: {
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    inlineActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    smallButton: {
      minHeight: 40,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    smallButtonText: {
      ...textStyles.buttonSmall,
    },
    activityEntry: {
      marginTop: spacing.md,
      marginBottom: spacing.md,
    },
    activityUserPressable: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    activityHeaderText: {
      flex: 1,
      minWidth: 0,
    },
    activityMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
    },
    activityHeadline: {
      ...textStyles.bodySmallStrong,
      color: colors.text,
      lineHeight: 20,
      marginTop: 2,
    },
    activityHeadlineName: {
      ...textStyles.bodyStrong,
      color: colors.primary,
    },
    activityMetaDot: {
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
      marginHorizontal: 6,
    },
    activityTimestamp: {
      ...textStyles.bodySmall,
      color: colors.textMuted,
    },
    activityContent: {
      marginTop: spacing.md,
      alignItems: 'center',
    },
    activityContentComment: {
      marginTop: spacing.xs,
    },
    activityBodyStatic: {
      opacity: 0.92,
    },
    activityPrompt: {
      ...textStyles.bodyStrong,
      color: colors.text,
      lineHeight: 22,
      marginTop: spacing.md,
      width: '100%',
      maxWidth: 320,
    },
    activityComment: {
      ...textStyles.italicStrong,
      color: colors.text,
      lineHeight: 22,
      marginTop: spacing.md - 2,
      width: '100%',
      maxWidth: 320,
    },
    activityImage: {
      width: '100%',
      maxWidth: 320,
      aspectRatio: 3 / 4,
      borderRadius: radii.md,
      backgroundColor: colors.bg,
    },
    activityFooter: {
      marginTop: spacing.xs,
    },
    avatarImage: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    avatarFallback: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    avatarFallbackText: {
      ...textStyles.bodyStrong,
      color: colors.primaryTextOn,
    },
    centerRow: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.sm,
    },
    centerRowTall: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing['2xl'],
    },
    emptyText: {
      color: colors.textMuted,
      marginTop: spacing.xs,
      lineHeight: 20,
      paddingHorizontal: 2,
    },
    emptyStateWrap: {
      paddingHorizontal: 2,
    },
    contactsConsentCard: {
      flex: 1,
      width: '100%',
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing['3xl'],
      justifyContent: 'space-between',
    },
    contactsConsentContent: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
    },
    contactsConsentTitle: {
      ...textStyles.title,
      color: colors.text,
      textAlign: 'center',
      maxWidth: 320,
    },
    contactsConsentBody: {
      ...textStyles.body,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 22,
      marginTop: spacing.md,
      maxWidth: 320,
    },
    contactsConsentFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    contactsConsentSkipButton: {
      minHeight: 46,
      minWidth: 92,
      paddingHorizontal: spacing.md,
    },
    contactsConsentContinueButton: {
      flex: 1,
    },
    footerSkipButton: {
      minHeight: 54,
      minWidth: 92,
      paddingHorizontal: spacing.md,
    },
    footerSkipButtonText: {
      ...textStyles.buttonSmall,
      color: colors.primaryTextOn,
    },
    footerSendButton: {
      flex: 1,
    },
    modalScreen: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    modalCard: {
      flex: 1,
      width: '100%',
      backgroundColor: colors.surface,
      padding: spacing.xl,
    },
    modalHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    modalTitle: {
      ...textStyles.title,
      color: colors.text,
      flex: 1,
    },
    modalListWrap: {
      flex: 1,
      minHeight: 180,
      marginTop: spacing.lg,
    },
    modalList: {
      flex: 1,
    },
    modalListContent: {
      paddingBottom: spacing.sm,
    },
    modalFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.lg,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    modalSharePressable: {
      alignSelf: 'stretch',
      minHeight: 40,
      marginTop: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radii.round,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalSharePressableText: {
      ...textStyles.buttonSmall,
      color: colors.primary,
      letterSpacing: 0.4,
    },
    pressed: {
      opacity: 0.78,
    },
  });
}
