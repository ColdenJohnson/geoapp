import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Keyboard,
  Modal,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { Image } from 'expo-image';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  declineQuestChallenge,
  fetchRankedQuests,
  fetchSavedQuests,
  saveQuest,
  sendQuestChallenge,
  unsaveQuest
} from '@/lib/api';
import { buildViewPhotoChallengeRoute } from '@/lib/navigation';
import { setUploadSubmitResolver } from '@/lib/promiseStore';
import { subscribeUploadQueue } from '@/lib/uploadQueue';
import { readPinCommentsCache } from '@/lib/pinChallengeCache';
import { getTopRankedPhotoComment } from '@/lib/photoCommentRanking';
import { useBottomTabOverflow } from '@/components/ui/TabBarBackground';
import {
  PressHoldActionMenu,
  PRESS_HOLD_ACTION_MENU_DEFAULT_SIZE,
  getPressHoldActionMenuOptionAtPoint,
  getPressHoldActionMenuPosition,
} from '@/components/ui/PressHoldActionMenu';
import { Toast, useToast } from '@/components/ui/Toast';
import { createFormStyles } from '@/components/ui/FormStyles';
import { TutorialCallout } from '@/components/ui/TutorialCallout';
import { APP_TUTORIAL_STEPS, AuthContext } from '@/hooks/AuthContext';
import { usePalette } from '@/hooks/usePalette';
import { PUBLIC_BASE_URL } from '@/lib/apiClient';
import { filterChallengesByPrompt, isQuestSearchReady, normalizeQuestSearchText } from '@/lib/questSearch';
import { spacing, radii } from '@/theme/tokens';
import { textStyles } from '@/theme/typography';

const CARD_ASPECT_RATIO = 3 / 4;
const SWIPE_THRESHOLD = 110;
const SWIPE_UP_THRESHOLD = 110;
const STACK_DEPTH = 3;
const LONG_PRESS_DELAY_MS = 380;
const LONG_PRESS_CANCEL_DISTANCE = 8;
const TAP_OPEN_MAX_DISTANCE = 8;
const SESSION_CHALLENGE_CACHE = {
  uid: null,
  all: null,
  saved: null,
};
const SESSION_CHALLENGE_CANONICAL_CACHE = {
  uid: null,
  all: null,
};
const SESSION_SAVED_PIN_IDS = new Set();
const SESSION_DEFERRED_CHALLENGE_PIN_IDS = [];
const rankedQuestCacheKey = (uid) => `ranked_quests_cache_${uid}`;
const QUEST_IMAGE_PREFETCH_LIMIT = 6;
const NEW_QUEST_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const STORED_QUEST_TAGS = [
  { id: 'common', label: 'Popular' },
  { id: 'crazy', label: 'Crazy' },
  { id: 'social', label: 'Social' },
  { id: 'fitness', label: 'Fitness' },
  { id: 'nature', label: 'Nature' },
  { id: 'food', label: 'Food' },
  { id: 'travel', label: 'Travel' },
  { id: 'misc', label: 'Misc' },
];
const STORED_QUEST_TAG_SET = new Set(STORED_QUEST_TAGS.map((tag) => tag.id));
const QUEST_TAG_LABEL_BY_ID = STORED_QUEST_TAGS.reduce((labels, tag) => {
  labels[tag.id] = tag.label;
  return labels;
}, { new: 'New' });
const QUEST_FILTERS = [
  { id: 'all', label: 'All', type: 'all' },
  { id: 'new', label: 'New', type: 'new' },
  ...STORED_QUEST_TAGS.map((tag) => ({ ...tag, type: 'tag' })),
];
const ADMIN_UIDS = String(process.env.EXPO_PUBLIC_ADMIN_UIDS || process.env.EXPO_PUBLIC_ADMIN_UID || '')
  .split(',')
  .map((uid) => uid.trim())
  .filter(Boolean);

function resetSessionChallengeCache(uid) {
  const normalizedUid = uid || null;
  if (SESSION_CHALLENGE_CACHE.uid === normalizedUid) {
    return;
  }

  SESSION_CHALLENGE_CACHE.uid = normalizedUid;
  SESSION_CHALLENGE_CACHE.all = null;
  SESSION_CHALLENGE_CACHE.saved = null;
  SESSION_CHALLENGE_CANONICAL_CACHE.uid = normalizedUid;
  SESSION_CHALLENGE_CANONICAL_CACHE.all = null;
  SESSION_SAVED_PIN_IDS.clear();
  SESSION_DEFERRED_CHALLENGE_PIN_IDS.length = 0;
}

function isOfflineState(state) {
  return state?.isConnected === false || state?.isInternetReachable === false;
}

function isAdminUid(uid) {
  return !!uid && ADMIN_UIDS.includes(uid);
}

function prefetchChallengeTeaserPhotos(challengeItems) {
  if (!Array.isArray(challengeItems) || challengeItems.length === 0) {
    return;
  }

  const teaserUrls = Array.from(new Set(
    challengeItems
      .map((challenge) => (typeof challenge?.teaserPhoto === 'string' ? challenge.teaserPhoto : null))
      .filter(Boolean)
  )).slice(0, QUEST_IMAGE_PREFETCH_LIMIT);

  for (const url of teaserUrls) {
    Image.prefetch(url).catch((error) => {
      console.warn('Failed to prefetch quest teaser photo', error);
    });
  }
}

async function readRankedQuestCache(uid) {
  if (!uid) {
    return { challenges: null, hadCache: false };
  }

  try {
    const raw = await AsyncStorage.getItem(rankedQuestCacheKey(uid));
    if (!raw) {
      return { challenges: null, hadCache: false };
    }

    const parsed = JSON.parse(raw);
    const challenges = Array.isArray(parsed?.challenges)
      ? parsed.challenges.map(normalizeCachedChallenge).filter(Boolean)
      : null;
    if (!challenges) {
      return { challenges: null, hadCache: false };
    }

    return { challenges, hadCache: true };
  } catch (error) {
    console.warn('Failed to read ranked quests cache', error);
    return { challenges: null, hadCache: false };
  }
}

async function writeRankedQuestCache(uid, challenges) {
  if (!uid || !Array.isArray(challenges)) {
    return;
  }

  try {
    await AsyncStorage.setItem(
      rankedQuestCacheKey(uid),
      JSON.stringify({
        challenges,
        fetchedAt: Date.now(),
      })
    );
  } catch (error) {
    console.warn('Failed to write ranked quests cache', error);
  }
}

function moveDeferredChallengeToBack(pinId) {
  if (!pinId) return;
  const existingIndex = SESSION_DEFERRED_CHALLENGE_PIN_IDS.indexOf(pinId);
  if (existingIndex !== -1) {
    SESSION_DEFERRED_CHALLENGE_PIN_IDS.splice(existingIndex, 1);
  }
  SESSION_DEFERRED_CHALLENGE_PIN_IDS.push(pinId);
}

export function mergeRefreshedChallengesWithSessionQueue(
  currentChallenges,
  freshChallenges,
  deferredPinIds = []
) {
  if (!Array.isArray(freshChallenges) || freshChallenges.length === 0) {
    return { challenges: [], deferredPinIds: [] };
  }
  if (!Array.isArray(currentChallenges) || currentChallenges.length === 0) {
    return {
      challenges: freshChallenges,
      deferredPinIds: deferredPinIds.filter(Boolean),
    };
  }

  const freshByPinId = new Map(
    freshChallenges
      .filter((challenge) => challenge?.pinId)
      .map((challenge) => [challenge.pinId, challenge])
  );
  const preservedVisiblePinIds = [];
  const preservedVisiblePinIdSet = new Set();

  currentChallenges.slice(0, STACK_DEPTH).forEach((challenge) => {
    const pinId = challenge?.pinId;
    if (!pinId || preservedVisiblePinIdSet.has(pinId) || !freshByPinId.has(pinId)) {
      return;
    }
    preservedVisiblePinIds.push(pinId);
    preservedVisiblePinIdSet.add(pinId);
  });

  const nextDeferredPinIds = deferredPinIds.filter(
    (pinId, index, array) => (
      !!pinId &&
      array.indexOf(pinId) === index &&
      freshByPinId.has(pinId) &&
      !preservedVisiblePinIdSet.has(pinId)
    )
  );
  const excludedPinIds = new Set([...preservedVisiblePinIds, ...nextDeferredPinIds]);
  const preservedVisibleChallenges = preservedVisiblePinIds.map((pinId) => (
    currentChallenges.find((challenge) => challenge?.pinId === pinId) || freshByPinId.get(pinId)
  )).filter(Boolean);
  const upcomingChallenges = freshChallenges.filter((challenge) => !excludedPinIds.has(challenge?.pinId));
  const deferredChallenges = nextDeferredPinIds
    .map((pinId) => freshByPinId.get(pinId))
    .filter(Boolean);

  return {
    challenges: [...preservedVisibleChallenges, ...upcomingChallenges, ...deferredChallenges],
    deferredPinIds: nextDeferredPinIds,
  };
}

function normalizeTeaserComment(comment) {
  const text = typeof comment?.text === 'string' ? comment.text.trim() : '';
  if (!text) return null;

  const handle = typeof comment?.created_by_handle === 'string' ? comment.created_by_handle.trim() : '';
  const creatorHandle = handle
    ? (handle.startsWith('@') ? handle : `@${handle}`)
    : null;

  return {
    _id: comment?._id ? String(comment._id) : null,
    text,
    creatorHandle,
    likeCount: Number.isFinite(comment?.like_count) ? comment.like_count : 0,
    createdAt: typeof comment?.createdAt === 'string' ? comment.createdAt : null,
  };
}

function normalizeQuestTags(rawTags, context = 'quest') {
  if (!Array.isArray(rawTags)) {
    return [];
  }

  const normalizedTags = [];
  const strippedTags = [];
  const seenTags = new Set();
  const seenStrippedTags = new Set();

  rawTags.forEach((rawTag) => {
    const normalized = typeof rawTag === 'string' ? rawTag.trim().toLowerCase() : '';
    if (!normalized || !STORED_QUEST_TAG_SET.has(normalized)) {
      const warningValue = normalized || String(rawTag);
      if (!seenStrippedTags.has(warningValue)) {
        strippedTags.push(warningValue);
        seenStrippedTags.add(warningValue);
      }
      return;
    }
    if (!seenTags.has(normalized)) {
      normalizedTags.push(normalized);
      seenTags.add(normalized);
    }
  });

  if (strippedTags.length) {
    console.warn('[quest_tags] stripped unknown quest tags on client', {
      context,
      strippedTags,
    });
  }

  return normalizedTags;
}

function parseQuestCreatedAtMs(createdAt) {
  if (!createdAt) {
    return 0;
  }
  if (createdAt instanceof Date) {
    const timestamp = createdAt.getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
  const timestamp = Date.parse(createdAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isNewQuest(challenge, nowMs = Date.now()) {
  return Number.isFinite(challenge?.createdAtMs)
    && challenge.createdAtMs >= nowMs - NEW_QUEST_WINDOW_MS;
}

function getQuestDisplayTagIds(challenge, nowMs = Date.now()) {
  const displayTags = [];
  if (isNewQuest(challenge, nowMs)) {
    displayTags.push('new');
  }
  if (Array.isArray(challenge?.tags)) {
    challenge.tags.forEach((tag) => {
      if (!displayTags.includes(tag)) {
        displayTags.push(tag);
      }
    });
  }
  return displayTags;
}

function normalizeCachedChallenge(challenge) {
  if (!challenge || typeof challenge !== 'object') {
    return null;
  }

  const createdAtMs = Number.isFinite(challenge?.createdAtMs)
    ? challenge.createdAtMs
    : parseQuestCreatedAtMs(challenge?.createdAt);

  return {
    ...challenge,
    tags: normalizeQuestTags(challenge?.tags, challenge?.pinId || 'cached quest'),
    createdAt: challenge?.createdAt || null,
    createdAtMs,
  };
}

function formatFriendParticipationLabel(count) {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count === 1 ? '1 friend' : `${count} friends`;
}

async function overlayCachedTeaserComments(challengeItems) {
  if (!Array.isArray(challengeItems) || challengeItems.length === 0) {
    return [];
  }

  const teaserPhotoIds = Array.from(new Set(
    challengeItems
      .map((challenge) => challenge?.teaserPhotoId)
      .filter(Boolean)
  ));
  if (teaserPhotoIds.length === 0) {
    return challengeItems;
  }

  const cacheEntries = await Promise.all(
    teaserPhotoIds.map(async (photoId) => ([
      photoId,
      await readPinCommentsCache(photoId, { ttlMs: Number.MAX_SAFE_INTEGER }),
    ]))
  );

  const topCommentByPhotoId = new Map();
  for (const [photoId, cacheEntry] of cacheEntries) {
    const cachedComments = Array.isArray(cacheEntry?.comments) ? cacheEntry.comments : [];
    const cachedTopComment = normalizeTeaserComment(getTopRankedPhotoComment(cachedComments));
    if (cachedTopComment) {
      topCommentByPhotoId.set(photoId, cachedTopComment);
      continue;
    }
    if (cacheEntry?.hadCache === true && cacheEntry?.isFresh === true) {
      topCommentByPhotoId.set(photoId, null);
    }
  }

  if (topCommentByPhotoId.size === 0) {
    return challengeItems;
  }

  return challengeItems.map((challenge) => {
    if (!challenge?.teaserPhotoId || !topCommentByPhotoId.has(challenge.teaserPhotoId)) {
      return challenge;
    }
    return {
      ...challenge,
      teaserTopComment: topCommentByPhotoId.get(challenge.teaserPhotoId),
    };
  });
}

function normalizeChallengePin(pin, index, { isSaved = false } = {}) {
  const pinId = pin?._id ? String(pin._id) : `challenge-${index}`;
  const prompt = typeof pin?.message === 'string' && pin.message.trim()
    ? pin.message.trim()
    : 'Untitled challenge';
  const handle = typeof pin?.created_by_handle === 'string' && pin.created_by_handle.trim()
    ? pin.created_by_handle.trim()
    : 'anon';
  const creatorName = typeof pin?.created_by_name === 'string' && pin.created_by_name.trim()
    ? pin.created_by_name.trim()
    : 'Anonymous';
  const uploadsCount = Number.isFinite(pin?.photo_count) ? Math.max(0, pin.photo_count) : 0;
  const teaserPhoto = typeof pin?.top_global_photo?.file_url === 'string' && pin.top_global_photo.file_url
    ? pin.top_global_photo.file_url
    : typeof pin?.most_recent_photo_url === 'string' && pin.most_recent_photo_url
      ? pin.most_recent_photo_url
    : null;
  const teaserPhotoId = pin?.top_global_photo?.photo_id ? String(pin.top_global_photo.photo_id) : null;
  const creatorHandleRaw = handle.startsWith('@') ? handle.slice(1) : handle;
  const featuredHandle = typeof pin?.top_global_photo?.created_by_handle === 'string' && pin.top_global_photo.created_by_handle.trim()
    ? pin.top_global_photo.created_by_handle.trim()
    : handle;
  const featuredPhotoHandleRaw = featuredHandle.startsWith('@') ? featuredHandle.slice(1) : featuredHandle;
  const friendParticipantCount = Number.isFinite(pin?.friend_participant_count)
    ? Math.max(0, pin.friend_participant_count)
    : 0;
  const teaserTopComment = teaserPhotoId
    ? normalizeTeaserComment(pin?.top_global_photo?.top_comment)
    : null;
  const tags = normalizeQuestTags(pin?.tags, pinId);
  const createdAtMs = parseQuestCreatedAtMs(pin?.createdAt);
  const rawBanner = pin?.challenge_banner;
  const challengeBanner = rawBanner && rawBanner.challenge_id
    ? {
        challengeId: String(rawBanner.challenge_id),
        senderUid: typeof rawBanner.sender_uid === 'string' ? rawBanner.sender_uid : null,
        senderHandle: typeof rawBanner.sender_handle === 'string' && rawBanner.sender_handle
          ? rawBanner.sender_handle
          : null,
      }
    : null;

  return {
    pinId,
    prompt,
    creatorHandle: `@${creatorHandleRaw}`,
    creatorHandleRaw,
    featuredPhotoHandle: `@${featuredPhotoHandleRaw}`,
    creatorName,
    uploadsCount,
    teaserPhoto,
    teaserPhotoId,
    teaserTopComment,
    friendParticipantCount,
    tags,
    createdAt: pin?.createdAt || null,
    createdAtMs,
    isSaved,
    challengeBanner,
  };
}

export default function ActiveChallengesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomTabOverflow = useBottomTabOverflow();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { user, friends, isAppTutorialStepVisible, advanceAppTutorial } = useContext(AuthContext);
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const formStyles = useMemo(() => createFormStyles(colors), [colors]);
  const { message: toastMessage, show: showToast } = useToast(3000);

  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [pendingNewChallengeCount, setPendingNewChallengeCount] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [uploadingPinId, setUploadingPinId] = useState(null);
  const [queueMode, setQueueMode] = useState('all');
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [challengeOptions, setChallengeOptions] = useState(null);
  const [challengeMenuSize, setChallengeMenuSize] = useState(PRESS_HOLD_ACTION_MENU_DEFAULT_SIZE);
  const [activeChallengeOptionId, setActiveChallengeOptionId] = useState(null);
  const [questSearchInput, setQuestSearchInput] = useState('');
  const [forceQuestSearch, setForceQuestSearch] = useState(false);
  const [selectedQuestFilter, setSelectedQuestFilter] = useState('all');
  const [showSavedQueueHint, setShowSavedQueueHint] = useState(false);
  const [friendSelectorVisible, setFriendSelectorVisible] = useState(false);
  const [friendSelectorQuest, setFriendSelectorQuest] = useState(null);
  const [friendSelectorBusy, setFriendSelectorBusy] = useState(false);
  // Map of pinId -> Set<recipientUid> tracking challenges sent this session
  const sentChallengesRef = useRef({});
  const cardPan = useRef(new Animated.ValueXY()).current;
  const swipeAnimatingPinId = useRef(null);
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);
  const challengeOptionLayoutsRef = useRef({});
  const lastMenuTouchPointRef = useRef(null);

  const stageWidth = stageSize.width || Math.max(windowWidth - spacing.sm * 2, 0);
  const stageHeight = stageSize.height || Math.max(windowHeight - 200, 0);
  const cardWidth = Math.max(
    180,
    Math.min(
      stageWidth * 0.99,
      stageHeight * CARD_ASPECT_RATIO * 0.99,
      430,
    ),
  );
  const cardHeight = cardWidth / CARD_ASPECT_RATIO;
  const cardRotate = cardPan.x.interpolate({
    inputRange: [-cardWidth, 0, cardWidth],
    outputRange: ['-12deg', '0deg', '12deg'],
    extrapolate: 'clamp',
  });
  const horizontalPromoteProgress = cardPan.x.interpolate({
    inputRange: [-cardWidth, 0, cardWidth],
    outputRange: [1, 0, 1],
    extrapolate: 'clamp',
  });
  const verticalPromoteProgress = cardPan.y.interpolate({
    inputRange: [-cardHeight, 0, cardHeight],
    outputRange: [1, 0, 0],
    extrapolate: 'clamp',
  });
  const nextCardPromoteProgress = Animated.add(horizontalPromoteProgress, verticalPromoteProgress).interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0, 1, 1],
    extrapolate: 'clamp',
  });
  const nextCardScale = nextCardPromoteProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.95, 1],
    extrapolate: 'clamp',
  });
  const nextCardTranslateY = nextCardPromoteProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
    extrapolate: 'clamp',
  });
  const nextCardRotate = nextCardPromoteProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['1.5deg', '0deg'],
    extrapolate: 'clamp',
  });
  const selectOpacity = cardPan.x.interpolate({
    inputRange: [30, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const skipOpacity = cardPan.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, -30],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const saveOpacity = cardPan.y.interpolate({
    inputRange: [-SWIPE_UP_THRESHOLD, -30],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const footerSafePadding = Math.max(0, insets.bottom + bottomTabOverflow);
  const toastBottomOffset = footerSafePadding + 22;
  const swipeLocked = loading || isAnimating || uploadingPinId !== null;
  const interactionLocked = swipeLocked || challengeOptions !== null;
  const normalizedQuestSearchInput = useMemo(
    () => normalizeQuestSearchText(questSearchInput),
    [questSearchInput]
  );
  const liveQuestSearchEnabled = useMemo(
    () => isQuestSearchReady(questSearchInput),
    [questSearchInput]
  );
  const questSearchEnabled = normalizedQuestSearchInput.length > 0 && (forceQuestSearch || liveQuestSearchEnabled);
  const selectedQuestFilterOption = useMemo(
    () => QUEST_FILTERS.find((filter) => filter.id === selectedQuestFilter) || QUEST_FILTERS[0],
    [selectedQuestFilter]
  );
  const filteredChallenges = useMemo(() => {
    const searchedChallenges = questSearchEnabled
      ? filterChallengesByPrompt(challenges, questSearchInput)
      : challenges;

    if (selectedQuestFilterOption.type === 'new') {
      return searchedChallenges.filter((challenge) => isNewQuest(challenge));
    }

    if (selectedQuestFilterOption.type === 'tag') {
      return searchedChallenges.filter((challenge) => (
        Array.isArray(challenge?.tags) && challenge.tags.includes(selectedQuestFilterOption.id)
      ));
    }

    return searchedChallenges;
  }, [challenges, questSearchEnabled, questSearchInput, selectedQuestFilterOption]);
  const hasActiveQuestFilter = selectedQuestFilterOption.type !== 'all';
  const showOfflineBanner = queueMode === 'all' && isOffline && challenges.length > 0 && !loading;
  const showRefreshingBanner = queueMode === 'all' && refreshing && challenges.length > 0 && !loading && !isOffline;
  const showPendingQuestBanner = queueMode === 'all' && pendingNewChallengeCount > 0 && !loading;
  const stack = filteredChallenges.slice(0, STACK_DEPTH);
  const activeChallenge = stack[0] ?? null;
  const showQuestTutorial = isAppTutorialStepVisible(APP_TUTORIAL_STEPS.QUESTS_TAB);
  const showAdminQuestTools = isAdminUid(user?.uid);
  const panTargetPinId = swipeAnimatingPinId.current ?? activeChallenge?.pinId ?? null;
  const questTutorialWidth = Math.min(360, Math.max(300, windowWidth - 40));
  const challengeOptionsPosition = useMemo(() => {
    if (!challengeOptions) return null;

    return getPressHoldActionMenuPosition({
      anchorX: challengeOptions.x,
      anchorY: challengeOptions.y,
      menuSize: challengeMenuSize,
      windowWidth,
      windowHeight,
      topInset: insets.top,
      bottomInset: footerSafePadding,
    });
  }, [challengeMenuSize, challengeOptions, footerSafePadding, insets.top, windowHeight, windowWidth]);

  const challengeOptionSections = useMemo(() => ([
    {
      id: 'primary',
      layout: 'row',
      options: [
        {
          id: 'share',
          label: 'Share',
          iconName: 'share',
        },
        {
          id: 'save',
          label: 'Save',
          iconName: queueMode === 'saved' ? 'bookmark' : 'bookmark-border',
        },
        {
          id: 'join',
          label: 'Join',
          iconName: 'photo-camera',
        },
      ],
    },
    {
      id: 'secondary',
      layout: 'list',
      options: [
        {
          id: 'view_photos',
          label: 'View Photos',
          iconName: 'photo-library',
        },
        {
          id: 'report',
          label: 'Report',
          iconName: 'outlined-flag',
          iconColor: colors.danger,
          iconBackgroundColor: 'rgba(220,38,38,0.09)',
          textColor: colors.danger,
        },
      ],
    },
  ]), [colors.danger, queueMode]);
  const challengeMenuOptionsById = useMemo(
    () => new Map(
      challengeOptionSections.flatMap((section) =>
        (Array.isArray(section?.options) ? section.options : []).map((option) => [option.id, option])
      )
    ),
    [challengeOptionSections]
  );

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      globalThis.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const dismissQuestTutorial = useCallback(() => {
    if (!showQuestTutorial) return;
    advanceAppTutorial(APP_TUTORIAL_STEPS.QUESTS_TAB);
  }, [advanceAppTutorial, showQuestTutorial]);

  const setHighlightedChallengeOption = useCallback((optionId) => {
    setActiveChallengeOptionId((prev) => (prev === optionId ? prev : optionId));
  }, []);

  const resolveChallengeOptionAtPoint = useCallback((pointX, pointY) => (
    getPressHoldActionMenuOptionAtPoint({
      optionLayouts: challengeOptionLayoutsRef.current,
      pointX,
      pointY,
    })
  ), []);

  const syncChallengeOptionHighlight = useCallback((pointX, pointY) => {
    lastMenuTouchPointRef.current = { x: pointX, y: pointY };
    const nextOptionId = resolveChallengeOptionAtPoint(pointX, pointY);
    setHighlightedChallengeOption(nextOptionId);
    return nextOptionId;
  }, [resolveChallengeOptionAtPoint, setHighlightedChallengeOption]);

  const triggerMenuOpenHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const triggerMenuSelectionHaptic = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const closeChallengeOptions = useCallback(() => {
    clearLongPressTimer();
    longPressTriggeredRef.current = false;
    challengeOptionLayoutsRef.current = {};
    lastMenuTouchPointRef.current = null;
    setActiveChallengeOptionId(null);
    setChallengeMenuSize(PRESS_HOLD_ACTION_MENU_DEFAULT_SIZE);
    setChallengeOptions(null);
  }, [clearLongPressTimer]);

  const resetCardPosition = useCallback(() => {
    Animated.spring(cardPan, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
      damping: 17,
      stiffness: 170,
    }).start();
  }, [cardPan]);

  useEffect(() => {
    return () => {
      clearLongPressTimer();
    };
  }, [clearLongPressTimer]);

  useEffect(() => {
    resetSessionChallengeCache(user?.uid);
    setChallenges([]);
    setLoading(true);
    setRefreshing(false);
  }, [user?.uid]);

  useEffect(() => {
    let cancelled = false;

    const syncNetworkState = (state) => {
      if (cancelled) return;
      setIsOffline(isOfflineState(state));
    };

    NetInfo.fetch()
      .then(syncNetworkState)
      .catch((error) => {
        console.warn('Failed to inspect quest network state', error);
      });

    const unsubscribe = NetInfo.addEventListener(syncNetworkState);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const loadChallenges = useCallback(async ({ showSpinner = true, mode = 'all', force = false } = {}) => {
    const cachedRows = force ? null : SESSION_CHALLENGE_CACHE[mode];
    if (Array.isArray(cachedRows)) {
      setChallenges(cachedRows);
      setLoading(false);
      setRefreshing(false);
      return true;
    }

    let hydratedFromDiskCache = false;
    if (!force && mode === 'all') {
      const { challenges: cachedChallenges, hadCache } = await readRankedQuestCache(user?.uid);
      if (hadCache) {
        SESSION_CHALLENGE_CANONICAL_CACHE.all = cachedChallenges;
        SESSION_CHALLENGE_CACHE.all = cachedChallenges;
        setChallenges(cachedChallenges);
        setLoading(false);
        hydratedFromDiskCache = true;
      }
    }

    if (showSpinner && !hydratedFromDiskCache) {
      setLoading(true);
    }

    setRefreshing(true);
    try {
      const rows = mode === 'saved'
        ? await fetchSavedQuests()
        : await fetchRankedQuests({ includeRankingDebug: true });
      const sorted = Array.isArray(rows) ? rows : [];
      const normalizedChallenges = sorted.map((pin, index) => {
        const pinId = pin?._id ? String(pin._id) : `challenge-${index}`;
        return normalizeChallengePin(pin, index, {
          isSaved: mode === 'saved' || SESSION_SAVED_PIN_IDS.has(pinId),
        });
      });
      const hydratedChallenges = await overlayCachedTeaserComments(normalizedChallenges);
      if (
        mode === 'all' &&
        hydratedChallenges.length === 0 &&
        Array.isArray(SESSION_CHALLENGE_CACHE.all) &&
        SESSION_CHALLENGE_CACHE.all.length > 0
      ) {
        setChallenges(SESSION_CHALLENGE_CACHE.all);
        return false;
      }
      if (mode === 'saved') {
        SESSION_SAVED_PIN_IDS.clear();
        hydratedChallenges.forEach((challenge) => {
          if (challenge?.pinId) {
            SESSION_SAVED_PIN_IDS.add(challenge.pinId);
          }
        });
        if (Array.isArray(SESSION_CHALLENGE_CACHE.all)) {
          SESSION_CHALLENGE_CACHE.all = SESSION_CHALLENGE_CACHE.all.map((challenge) => ({
            ...challenge,
            isSaved: SESSION_SAVED_PIN_IDS.has(challenge?.pinId),
          }));
          if (Array.isArray(SESSION_CHALLENGE_CANONICAL_CACHE.all)) {
            SESSION_CHALLENGE_CANONICAL_CACHE.all = SESSION_CHALLENGE_CANONICAL_CACHE.all.map((challenge) => ({
              ...challenge,
              isSaved: SESSION_SAVED_PIN_IDS.has(challenge?.pinId),
            }));
          }
          if (user?.uid && Array.isArray(SESSION_CHALLENGE_CANONICAL_CACHE.all)) {
            await writeRankedQuestCache(user.uid, SESSION_CHALLENGE_CANONICAL_CACHE.all);
          }
        }
      }
      if (mode === 'all') {
        SESSION_CHALLENGE_CANONICAL_CACHE.all = hydratedChallenges;
        const { challenges: mergedChallenges, deferredPinIds } = mergeRefreshedChallengesWithSessionQueue(
          SESSION_CHALLENGE_CACHE.all,
          hydratedChallenges,
          SESSION_DEFERRED_CHALLENGE_PIN_IDS
        );
        SESSION_DEFERRED_CHALLENGE_PIN_IDS.length = 0;
        SESSION_DEFERRED_CHALLENGE_PIN_IDS.push(...deferredPinIds);
        SESSION_CHALLENGE_CACHE.all = mergedChallenges;
        prefetchChallengeTeaserPhotos(mergedChallenges);
        if (user?.uid) {
          await writeRankedQuestCache(user.uid, hydratedChallenges);
        }
        setChallenges(mergedChallenges);
        return true;
      }
      SESSION_CHALLENGE_CACHE[mode] = hydratedChallenges;
      setChallenges(hydratedChallenges);
      return true;
    } catch (error) {
      console.error('Failed to fetch active challenges', error);
      return false;
    } finally {
      setRefreshing(false);
      if (showSpinner && !hydratedFromDiskCache) {
        setLoading(false);
      }
    }
  }, [user?.uid]);

  useEffect(() => {
    loadChallenges({ showSpinner: true, mode: queueMode });
  }, [loadChallenges, queueMode]);

  useEffect(() => {
    let prevCount = 0;
    const unsubscribe = subscribeUploadQueue((items) => {
      const count = items.filter((item) => item?.type === 'new_challenge').length;
      setPendingNewChallengeCount(count);
      if (prevCount > 0 && count === 0) {
        showToast('Quest created!', 2200);
        void loadChallenges({ showSpinner: false, force: true });
      }
      prevCount = count;
    });
    return unsubscribe;
  }, [loadChallenges, showToast]);

  useEffect(() => {
    closeChallengeOptions();
  }, [closeChallengeOptions, queueMode]);

  const handleQuestSearchInputChange = useCallback((value) => {
    setQuestSearchInput(value);
    if (!normalizeQuestSearchText(value)) {
      setForceQuestSearch(false);
    }
  }, []);

  const handleQuestSearchSubmit = useCallback(() => {
    if (!normalizedQuestSearchInput) return;
    setForceQuestSearch(true);
  }, [normalizedQuestSearchInput]);

  const handleQuestFilterPress = useCallback((filterId) => {
    if (!filterId) return;
    setSelectedQuestFilter(filterId);
  }, []);

  const handleQueueModeToggle = useCallback(() => {
    setShowSavedQueueHint(false);
    setQueueMode((prev) => (prev === 'saved' ? 'all' : 'saved'));
  }, []);

  const syncChallengeSavedState = useCallback((challenge, nextIsSaved) => {
    const pinId = challenge?.pinId;
    if (!pinId) return;

    if (nextIsSaved) {
      SESSION_SAVED_PIN_IDS.add(pinId);
    } else {
      SESSION_SAVED_PIN_IDS.delete(pinId);
    }

    const applySavedState = (items, { removeIfUnsaved = false, upsertIfSaved = false } = {}) => {
      if (!Array.isArray(items)) return items;

      let found = false;
      const nextItems = items.reduce((acc, item) => {
        if (item?.pinId !== pinId) {
          acc.push(item);
          return acc;
        }

        found = true;
        if (!nextIsSaved && removeIfUnsaved) {
          return acc;
        }

        acc.push({ ...item, isSaved: nextIsSaved });
        return acc;
      }, []);

      if (nextIsSaved && upsertIfSaved && !found) {
        nextItems.unshift({ ...challenge, isSaved: true });
      }

      return nextItems;
    };

    setChallenges((prev) => applySavedState(prev, {
      removeIfUnsaved: queueMode === 'saved',
    }));
    SESSION_CHALLENGE_CACHE.all = applySavedState(SESSION_CHALLENGE_CACHE.all);
    SESSION_CHALLENGE_CACHE.saved = applySavedState(SESSION_CHALLENGE_CACHE.saved, {
      removeIfUnsaved: true,
      upsertIfSaved: true,
    });
    SESSION_CHALLENGE_CANONICAL_CACHE.all = applySavedState(SESSION_CHALLENGE_CANONICAL_CACHE.all);
    if (user?.uid && Array.isArray(SESSION_CHALLENGE_CANONICAL_CACHE.all)) {
      Promise.resolve(writeRankedQuestCache(user.uid, SESSION_CHALLENGE_CANONICAL_CACHE.all)).catch(() => {});
    }
  }, [queueMode, user?.uid]);

  const advanceChallengeQueue = useCallback((direction, challengePinId) => {
    setChallenges((prev) => {
      if (!Array.isArray(prev) || prev.length === 0 || !challengePinId) return prev;
      const challengeIndex = prev.findIndex((challenge) => challenge?.pinId === challengePinId);
      if (challengeIndex === -1) return prev;
      let next = prev;
      if (direction === 'save' && queueMode === 'saved') {
        next = prev.filter((challenge) => challenge?.pinId !== challengePinId);
        SESSION_CHALLENGE_CACHE[queueMode] = next;
        return next;
      }
      if (prev.length < 2) return prev;
      next = prev.slice();
      const [selectedChallenge] = next.splice(challengeIndex, 1);
      next.push(selectedChallenge);
      SESSION_CHALLENGE_CACHE[queueMode] = next;
      if (queueMode === 'all') {
        moveDeferredChallengeToBack(challengePinId);
      }
      return next;
    });
  }, [queueMode]);

  const beginUploadForChallenge = useCallback((challenge) => {
    if (!challenge?.pinId) return;
    dismissQuestTutorial();
    const uploadRequestId = `quest-upload-${challenge.pinId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setUploadingPinId(challenge.pinId);
    setUploadSubmitResolver((submitResult) => {
      if (submitResult?.submitted) {
        advanceChallengeQueue('upload', challenge.pinId);
      }
    }, uploadRequestId);
    router.push({
      pathname: '/upload',
      params: {
        next: '/view_photochallenge',
        pinId: challenge.pinId,
        prompt: challenge.prompt,
        created_by_handle: challenge.creatorHandleRaw || '',
        uploadRequestId,
      },
    });

    // Only lock while handing off into the upload flow. Once the user is back on quests,
    // let the upload finish in the background without freezing the deck.
    setUploadingPinId(null);
  }, [advanceChallengeQueue, dismissQuestTutorial, router]);

  const handleUpSwipeAction = useCallback(async (challenge) => {
    if (!challenge?.pinId) return;
    if (queueMode === 'saved') {
      const result = await unsaveQuest(challenge.pinId);
      if (!result?.success) {
        showToast('Unsave failed', 2500);
        return;
      }
      syncChallengeSavedState(challenge, false);
      showToast('Removed from saved', 2200);
      return;
    }
    const result = await saveQuest(challenge.pinId);
    if (!result?.success) {
      showToast('Save failed', 2500);
      return;
    }
    syncChallengeSavedState(challenge, true);
    setShowSavedQueueHint(true);
    if (!result?.alreadySaved) {
      showToast('Saved for later', 2200);
    }
  }, [queueMode, showToast, syncChallengeSavedState]);

  const handleShareChallenge = useCallback(async (challenge) => {
    if (!challenge?.pinId) return;
    dismissQuestTutorial();
    Haptics.selectionAsync().catch(() => {});
    const shareUrl = `${PUBLIC_BASE_URL}/view_photochallenge/${encodeURIComponent(challenge.pinId)}`;
    const message = challenge?.prompt
      ? `Check out this SideQuest quest: "${challenge.prompt}"`
      : 'Check out this SideQuest quest.';

    try {
      await Share.share({
        title: 'View this quest on SideQuest',
        message,
        url: shareUrl,
      });
    } catch (error) {
      console.warn('Failed to share challenge', error);
      showToast('Unable to open share menu', 2500);
    }
  }, [dismissQuestTutorial, showToast]);

  const handleOpenFriendSelector = useCallback((challenge) => {
    if (!challenge?.pinId) return;
    dismissQuestTutorial();
    Haptics.selectionAsync().catch(() => {});
    setFriendSelectorQuest(challenge);
    setFriendSelectorVisible(true);
  }, [dismissQuestTutorial]);

  const handleSendChallenge = useCallback(async (friend) => {
    const challenge = friendSelectorQuest;
    if (!challenge?.pinId || !friend?.uid) return;

    const alreadySent = sentChallengesRef.current[challenge.pinId]?.has(friend.uid);
    if (alreadySent) {
      showToast(`Already challenged ${friend.display_name || friend.handle || 'this friend'}`, 2200);
      return;
    }

    setFriendSelectorBusy(true);
    const result = await sendQuestChallenge(challenge.pinId, friend.uid);
    setFriendSelectorBusy(false);

    if (!result?.success) {
      if (result?.code === 'already_sent') {
        if (!sentChallengesRef.current[challenge.pinId]) {
          sentChallengesRef.current[challenge.pinId] = new Set();
        }
        sentChallengesRef.current[challenge.pinId].add(friend.uid);
        showToast(`Already challenged ${friend.display_name || friend.handle || 'this friend'}`, 2200);
      } else {
        showToast('Failed to send challenge', 2500);
      }
      return;
    }

    if (!sentChallengesRef.current[challenge.pinId]) {
      sentChallengesRef.current[challenge.pinId] = new Set();
    }
    sentChallengesRef.current[challenge.pinId].add(friend.uid);
    setFriendSelectorVisible(false);
    showToast(`Challenge sent to ${friend.display_name || friend.handle || 'friend'}!`, 2200);
  }, [friendSelectorQuest, showToast]);

  const handleDeclineChallenge = useCallback(async (challenge) => {
    const challengeId = challenge?.challengeBanner?.challengeId;
    if (!challengeId || !challenge?.pinId) return;
    Haptics.selectionAsync().catch(() => {});
    const result = await declineQuestChallenge(challengeId);
    if (!result?.success) {
      showToast('Failed to decline challenge', 2500);
      return;
    }
    const pinId = challenge.pinId;
    const stripBanner = (items) => {
      if (!Array.isArray(items) || items.length === 0) return items;
      const idx = items.findIndex((c) => c?.pinId === pinId);
      if (idx === -1) return items;
      const next = items.slice();
      const [item] = next.splice(idx, 1);
      next.push({ ...item, challengeBanner: null });
      return next;
    };
    setChallenges(stripBanner);
    SESSION_CHALLENGE_CACHE.all = stripBanner(SESSION_CHALLENGE_CACHE.all);
    moveDeferredChallengeToBack(pinId);
    showToast('Challenge declined', 2200);
  }, [showToast]);

  const handleSaveChallenge = useCallback(async (challenge) => {
    if (!challenge?.pinId) return;
    dismissQuestTutorial();
    Haptics.selectionAsync().catch(() => {});
    const result = await saveQuest(challenge.pinId);
    if (!result?.success) {
      showToast('Save failed', 2500);
      return;
    }
    syncChallengeSavedState(challenge, true);
    setShowSavedQueueHint(true);
    if (result?.alreadySaved || queueMode === 'saved') {
      showToast('Already saved', 2200);
      return;
    }
    showToast('Saved for later', 2200);
  }, [dismissQuestTutorial, queueMode, showToast, syncChallengeSavedState]);

  const toggleChallengeSavedState = useCallback(async (challenge) => {
    if (!challenge?.pinId) return;
    dismissQuestTutorial();
    Haptics.selectionAsync().catch(() => {});

    if (challenge.isSaved) {
      const result = await unsaveQuest(challenge.pinId);
      if (!result?.success) {
        showToast('Unsave failed', 2500);
        return;
      }
      syncChallengeSavedState(challenge, false);
      showToast('Removed from saved', 2200);
      return;
    }

    const result = await saveQuest(challenge.pinId);
    if (!result?.success) {
      showToast('Save failed', 2500);
      return;
    }
    syncChallengeSavedState(challenge, true);
    setShowSavedQueueHint(true);
    if (result?.alreadySaved) {
      showToast('Already saved', 2200);
      return;
    }
    showToast('Saved for later', 2200);
  }, [dismissQuestTutorial, showToast, syncChallengeSavedState]);

  const handleViewPhotos = useCallback((challenge) => {
    if (!challenge?.pinId) return;
    dismissQuestTutorial();
    router.push(buildViewPhotoChallengeRoute({
      pinId: challenge.pinId,
      message: challenge.prompt,
      createdByHandle: challenge.creatorHandleRaw || '',
    }));
  }, [dismissQuestTutorial, router]);

  const handleChallengeMenuSelection = useCallback(async (option, challengeOverride = null) => {
    const challenge = challengeOverride || challengeOptions?.challenge;
    if (!option?.id || !challenge) {
      closeChallengeOptions();
      return;
    }

    closeChallengeOptions();
    triggerMenuSelectionHaptic();

    if (option.id === 'share') {
      await handleShareChallenge(challenge);
      return;
    }
    if (option.id === 'save') {
      await handleSaveChallenge(challenge);
      return;
    }
    if (option.id === 'join') {
      beginUploadForChallenge(challenge);
      return;
    }
    if (option.id === 'view_photos') {
      handleViewPhotos(challenge);
      return;
    }
  }, [
    beginUploadForChallenge,
    challengeOptions,
    closeChallengeOptions,
    handleSaveChallenge,
    handleShareChallenge,
    handleViewPhotos,
    triggerMenuSelectionHaptic,
  ]);

  const openChallengeOptions = useCallback((challenge, x, y) => {
    if (!challenge?.pinId) return;
    dismissQuestTutorial();
    challengeOptionLayoutsRef.current = {};
    lastMenuTouchPointRef.current = null;
    setActiveChallengeOptionId(null);
    setChallengeMenuSize(PRESS_HOLD_ACTION_MENU_DEFAULT_SIZE);
    cardPan.stopAnimation();
    cardPan.setValue({ x: 0, y: 0 });
    setChallengeOptions({ challenge, x, y });
    triggerMenuOpenHaptic();
  }, [cardPan, dismissQuestTutorial, triggerMenuOpenHaptic]);

  const commitSwipe = useCallback((direction) => {
    if (swipeLocked || !activeChallenge) return;
    dismissQuestTutorial();
    closeChallengeOptions();
    const topChallenge = activeChallenge;
    swipeAnimatingPinId.current = topChallenge.pinId;
    const isSave = direction === 'save';
    const isAccept = direction === 'accept';
    const exitX = isAccept ? cardWidth + 180 : -cardWidth - 180;
    const exitY = -Math.max(cardHeight, 240) - 180;
    const toValue = isSave
      ? { x: 0, y: exitY }
      : { x: exitX, y: 0 };
    setIsAnimating(true);
    Animated.timing(cardPan, {
      toValue,
      duration: 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (direction !== 'accept') {
        advanceChallengeQueue(direction, topChallenge.pinId);
      }
      requestAnimationFrame(() => {
        cardPan.setValue({ x: 0, y: 0 });
        swipeAnimatingPinId.current = null;
        setIsAnimating(false);
        if (finished && direction === 'accept') {
          beginUploadForChallenge(topChallenge);
        }
        if (finished && direction === 'save') {
          handleUpSwipeAction(topChallenge);
        }
      });
    });
  }, [
    advanceChallengeQueue,
    activeChallenge,
    cardHeight,
    cardPan,
    cardWidth,
    closeChallengeOptions,
    beginUploadForChallenge,
    dismissQuestTutorial,
    handleUpSwipeAction,
    swipeLocked,
  ]);

  const startLongPress = useCallback((challenge, x, y) => {
    clearLongPressTimer();
    longPressTriggeredRef.current = false;
    if (swipeLocked || challengeOptions || !challenge?.pinId) return;

    longPressTimerRef.current = globalThis.setTimeout(() => {
      longPressTimerRef.current = null;
      longPressTriggeredRef.current = true;
      openChallengeOptions(challenge, x, y);
    }, LONG_PRESS_DELAY_MS);
  }, [challengeOptions, clearLongPressTimer, openChallengeOptions, swipeLocked]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !interactionLocked && !!activeChallenge,
    onMoveShouldSetPanResponder: (_, gestureState) =>
      !interactionLocked &&
      !!activeChallenge &&
      (Math.abs(gestureState.dx) > 6 || Math.abs(gestureState.dy) > 6),
    onPanResponderGrant: (_, gestureState) => {
      startLongPress(activeChallenge, gestureState.x0, gestureState.y0);
    },
    onPanResponderMove: (_, gestureState) => {
      if (
        Math.abs(gestureState.dx) > LONG_PRESS_CANCEL_DISTANCE ||
        Math.abs(gestureState.dy) > LONG_PRESS_CANCEL_DISTANCE
      ) {
        clearLongPressTimer();
      }
      if (longPressTriggeredRef.current || challengeOptions) {
        syncChallengeOptionHighlight(gestureState.moveX, gestureState.moveY);
        return;
      }
      cardPan.setValue({ x: gestureState.dx, y: gestureState.dy });
    },
    onPanResponderRelease: (_, gestureState) => {
      clearLongPressTimer();
      if (longPressTriggeredRef.current || challengeOptions) {
        const selectedOptionId = syncChallengeOptionHighlight(
          gestureState.moveX || gestureState.x0,
          gestureState.moveY || gestureState.y0
        );
        longPressTriggeredRef.current = false;
        cardPan.setValue({ x: 0, y: 0 });
        const selectedOption = challengeMenuOptionsById.get(selectedOptionId);
        if (selectedOption && challengeOptions?.challenge) {
          handleChallengeMenuSelection(selectedOption, challengeOptions.challenge);
          return;
        }
        closeChallengeOptions();
        return;
      }
      if (
        gestureState.dy < -SWIPE_UP_THRESHOLD &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.05
      ) {
        commitSwipe('save');
        return;
      }
      if (gestureState.dx > SWIPE_THRESHOLD) {
        commitSwipe('accept');
        return;
      }
      if (gestureState.dx < -SWIPE_THRESHOLD) {
        commitSwipe('skip');
        return;
      }
      if (
        Math.abs(gestureState.dx) <= TAP_OPEN_MAX_DISTANCE &&
        Math.abs(gestureState.dy) <= TAP_OPEN_MAX_DISTANCE &&
        activeChallenge?.pinId
      ) {
        openChallengeOptions(
          activeChallenge,
          gestureState.moveX || gestureState.x0,
          gestureState.moveY || gestureState.y0
        );
        return;
      }
      resetCardPosition();
    },
    onPanResponderTerminate: () => {
      clearLongPressTimer();
      longPressTriggeredRef.current = false;
      closeChallengeOptions();
      resetCardPosition();
    },
  }), [
    cardPan,
    challengeOptions,
    challengeMenuOptionsById,
    clearLongPressTimer,
    closeChallengeOptions,
    commitSwipe,
    handleChallengeMenuSelection,
    interactionLocked,
    activeChallenge,
    openChallengeOptions,
    resetCardPosition,
    startLongPress,
    syncChallengeOptionHighlight,
  ]);
  const handleStageLayout = useCallback((event) => {
    const { width, height } = event.nativeEvent.layout;
    setStageSize((prev) => {
      if (prev.width === width && prev.height === height) {
        return prev;
      }
      return { width, height };
    });
  }, []);
  const handleChallengeMenuLayout = useCallback((layout) => {
    if (!layout?.width || !layout?.height) return;
    setChallengeMenuSize((prev) => {
      if (prev.width === layout.width && prev.height === layout.height) {
        return prev;
      }
      return { width: layout.width, height: layout.height };
    });
  }, []);

  const handleChallengeMenuOptionLayout = useCallback((optionId, layout) => {
    if (!optionId || !layout) return;
    challengeOptionLayoutsRef.current[optionId] = layout;
  }, []);

  const renderChallengeCard = useCallback((challenge, stackIndex) => {
    const isTop = stackIndex === 0;
    const isSecond = stackIndex === 1;
    const isContextCard = challengeOptions?.challenge?.pinId === challenge.pinId;
    const tracksPan = challenge.pinId === panTargetPinId;
    const stackScale = 1 - stackIndex * 0.05;
    const stackOffsetY = stackIndex * 12;
    const baseTransforms = [
      { scale: stackScale },
      { translateY: stackOffsetY },
      { rotate: `${stackIndex * 1.5}deg` },
    ];
    const transforms = tracksPan
      ? [{ translateX: cardPan.x }, { translateY: cardPan.y }, { rotate: cardRotate }]
      : isSecond
        ? [{ scale: nextCardScale }, { translateY: nextCardTranslateY }, { rotate: nextCardRotate }]
        : baseTransforms;
    const cardSaveIconName = challenge.isSaved ? 'bookmark' : 'bookmark-border';
    const friendParticipationLabel = formatFriendParticipationLabel(challenge.friendParticipantCount);
    const teaserComment = challenge.teaserTopComment;
    const showsBottomTeaser = !!friendParticipationLabel || !!teaserComment?.text;
    const challengeTags = getQuestDisplayTagIds(challenge);

    return (
      <Animated.View
        key={challenge.pinId}
        style={[
          styles.cardShell,
          isContextCard ? styles.cardShellContextActive : null,
          {
            width: cardWidth,
            aspectRatio: CARD_ASPECT_RATIO,
            zIndex: STACK_DEPTH - stackIndex,
            opacity: tracksPan && !isTop ? 0 : 1, // this is not actually necessary to make no flashing but am leaving it in as added gate: as long as the 2nd card is 'activated' by movement ahead of time it's ok.
            transform: transforms,
          },
        ]}
        {...(isTop && !interactionLocked ? panResponder.panHandlers : {})}
      >
        {isTop && tracksPan ? (
          <>
            <Animated.View style={[styles.selectBadge, { opacity: selectOpacity }]}>
              <Text style={styles.selectBadgeText}>ADD PHOTO</Text>
            </Animated.View>
            <Animated.View style={[styles.skipBadge, { opacity: skipOpacity }]}>
              <Text style={styles.skipBadgeText}>SKIP</Text>
            </Animated.View>
            <Animated.View style={[styles.saveBadge, { opacity: saveOpacity }]}>
              <Text style={styles.saveBadgeText}>{queueMode === 'saved' ? 'REMOVE' : 'SAVE'}</Text>
            </Animated.View>
          </>
        ) : null}

        <View style={styles.cardInner}>
          {challenge.teaserPhoto ? (
            <Image
              source={{ uri: challenge.teaserPhoto }}
              style={styles.cardImage}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[styles.cardImage, styles.cardImageFallback]}>
              <MaterialIcons name="image" size={44} color="rgba(255,255,255,0.76)" />
            </View>
          )}

          <View style={styles.dimLayer} pointerEvents="none" />
          <View style={styles.topMeta}>
            <View style={styles.cardTagRail}>
              {challenge.challengeBanner ? (
                <View style={styles.challengeBannerContent}>
                  <Pressable
                    style={[
                      styles.cardIconButton,
                      !isTop && styles.cardIconButtonInactive,
                    ]}
                    onPress={(event) => {
                      event?.stopPropagation?.();
                      handleDeclineChallenge(challenge);
                    }}
                    onPressIn={(event) => {
                      event?.stopPropagation?.();
                    }}
                    disabled={!isTop || interactionLocked}
                    hitSlop={8}
                    accessibilityLabel="Decline challenge"
                    testID={`quest-card-decline-button-${challenge.pinId}`}
                  >
                    <MaterialIcons name="close" size={18} color="#FFFFFF" />
                  </Pressable>
                  <Text style={styles.challengeBannerLabel} numberOfLines={1}>
                    {`challenged by @${challenge.challengeBanner.senderHandle || 'friend'}`}
                  </Text>
                </View>
              ) : challengeTags.length ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cardTagList}
                  keyboardShouldPersistTaps="handled"
                >
                  {challengeTags.map((tag) => (
                    <View
                      key={tag}
                      style={styles.cardTagChip}
                      testID={`quest-card-tag-${challenge.pinId}-${tag}`}
                    >
                      <Text style={styles.cardTagChipText}>
                        {QUEST_TAG_LABEL_BY_ID[tag] || tag}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              ) : null}
            </View>
            <View style={styles.cardActionRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.cardIconButton,
                  !isTop && styles.cardIconButtonInactive,
                  pressed && isTop ? styles.cardIconButtonPressed : null,
                ]}
                onPress={(event) => {
                  event?.stopPropagation?.();
                  handleShareChallenge(challenge);
                }}
                onPressIn={(event) => {
                  event?.stopPropagation?.();
                }}
                disabled={!isTop || interactionLocked}
                hitSlop={8}
                accessibilityLabel="Share quest"
                testID={`quest-card-share-button-${challenge.pinId}`}
              >
                <MaterialIcons name="share" size={18} color="#FFFFFF" />
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.cardIconButton,
                  !isTop && styles.cardIconButtonInactive,
                  pressed && isTop ? styles.cardIconButtonPressed : null,
                ]}
                onPress={(event) => {
                  event?.stopPropagation?.();
                  toggleChallengeSavedState(challenge);
                }}
                onPressIn={(event) => {
                  event?.stopPropagation?.();
                }}
                disabled={!isTop || interactionLocked}
                hitSlop={8}
                accessibilityLabel="Save quest"
                testID={`quest-card-save-button-${challenge.pinId}`}
              >
                <MaterialIcons name={cardSaveIconName} size={20} color="#FFFFFF" />
              </Pressable>
              {(() => {
                const alreadySentToAll = !!(
                  friends?.length &&
                  sentChallengesRef.current[challenge.pinId] &&
                  friends.every((f) => sentChallengesRef.current[challenge.pinId].has(f.uid))
                );
                const noFriends = !friends?.length;
                const sendDisabled = !isTop || interactionLocked || noFriends;
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.cardIconButton,
                      (!isTop || noFriends) && styles.cardIconButtonInactive,
                      pressed && isTop && !noFriends ? styles.cardIconButtonPressed : null,
                    ]}
                    onPress={(event) => {
                      event?.stopPropagation?.();
                      if (alreadySentToAll) {
                        showToast('Already challenged all friends to this quest', 2200);
                        return;
                      }
                      handleOpenFriendSelector(challenge);
                    }}
                    onPressIn={(event) => {
                      event?.stopPropagation?.();
                    }}
                    disabled={sendDisabled}
                    hitSlop={8}
                    accessibilityLabel="Challenge a friend"
                    testID={`quest-card-send-button-${challenge.pinId}`}
                  >
                    <MaterialIcons name="send" size={18} color="#FFFFFF" />
                  </Pressable>
                );
              })()}
            </View>
          </View>

          {challenge.challengeBanner && challengeTags.length ? (
            <View style={styles.challengeBannerRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.cardTagList}
                keyboardShouldPersistTaps="handled"
              >
                {challengeTags.map((tag) => (
                  <View
                    key={tag}
                    style={styles.cardTagChip}
                    testID={`quest-card-tag-${challenge.pinId}-${tag}`}
                  >
                    <Text style={styles.cardTagChipText}>
                      {QUEST_TAG_LABEL_BY_ID[tag] || tag}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={[styles.promptBlock, challenge.challengeBanner && styles.promptBlockShifted]}>
            <Text style={styles.promptText} numberOfLines={4}>
              "{challenge.prompt}"
            </Text>
          </View>

          {showsBottomTeaser ? (
            <View style={styles.bottomTeaser}>
              {friendParticipationLabel ? (
                <View style={styles.bottomTeaserRow}>
                  <Text style={styles.bottomTeaserLabel} numberOfLines={1}>
                    {friendParticipationLabel}
                  </Text>
                </View>
              ) : null}
              {teaserComment?.text ? (
                <View style={styles.bottomTeaserRow}>
                  <Text style={styles.bottomTeaserComment} numberOfLines={2}>
                    {teaserComment.creatorHandle ? (
                      <Text style={styles.bottomTeaserHandle}>{teaserComment.creatorHandle} </Text>
                    ) : null}
                    {teaserComment.text}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.bottomPhotoCount,
              pressed && isTop ? styles.bottomPhotoCountPressed : null,
              !isTop && styles.cardIconButtonInactive,
            ]}
            onPress={(event) => {
              event?.stopPropagation?.();
              handleViewPhotos(challenge);
            }}
            onPressIn={(event) => {
              event?.stopPropagation?.();
            }}
            disabled={!isTop || interactionLocked}
            hitSlop={8}
            accessibilityLabel="View quest photos"
            testID={`quest-card-view-photos-button-${challenge.pinId}`}
          >
            <View style={styles.photoCountChip}>
              <MaterialIcons name="photo-library" size={13} color="#FFFFFF" />
              <Text style={styles.photoCountText}>{challenge.uploadsCount}</Text>
            </View>
          </Pressable>
        </View>
      </Animated.View>
    );
  }, [
    cardPan.x,
    cardPan.y,
    cardRotate,
    cardWidth,
    panTargetPinId,
    nextCardScale,
    nextCardTranslateY,
    nextCardRotate,
    panResponder.panHandlers,
    selectOpacity,
    skipOpacity,
    saveOpacity,
    challengeOptions,
    queueMode,
    styles,
    handleDeclineChallenge,
    handleViewPhotos,
    handleShareChallenge,
    interactionLocked,
    toggleChallengeSavedState,
  ]);

  return (
    <>
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <SafeAreaView style={styles.safe}>
        <View style={[styles.container, { paddingTop: spacing.sm, paddingBottom: footerSafePadding + spacing.md }]}>
          {showOfflineBanner || showRefreshingBanner || showPendingQuestBanner ? (
            <View pointerEvents="none" style={styles.statusBannerOverlay}>
              {showOfflineBanner ? (
                <View style={[styles.statusBanner, styles.statusBannerOffline]}>
                  <MaterialIcons name="cloud-off" size={16} color={colors.danger} />
                  <Text style={styles.statusBannerText}>
                    Offline mode. Quests may be outdated.
                  </Text>
                </View>
              ) : null}
              {showRefreshingBanner ? (
                <View style={styles.statusBanner}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.statusBannerText}>
                    Updating quests…
                  </Text>
                </View>
              ) : null}
              {showPendingQuestBanner ? (
                <View style={styles.statusBanner}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.statusBannerText}>
                    Uploading new quest…
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.headerRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={[styles.questFilterScroller, { width: cardWidth }]}
              contentContainerStyle={styles.questFilterContent}
              keyboardShouldPersistTaps="handled"
            >
              {QUEST_FILTERS.map((filter) => {
                const selected = filter.id === selectedQuestFilter;
                return (
                  <Pressable
                    key={filter.id}
                    style={({ pressed }) => [
                      styles.questFilterChip,
                      selected && styles.questFilterChipSelected,
                      pressed && !selected ? styles.questFilterChipPressed : null,
                    ]}
                    onPress={() => handleQuestFilterPress(filter.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Filter quests by ${filter.label}`}
                    testID={`quest-filter-${filter.id}`}
                  >
                    <Text style={[
                      styles.questFilterChipText,
                      selected && styles.questFilterChipTextSelected,
                    ]}>
                      {filter.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={[styles.headerControlsRow, { width: cardWidth }]}>
              <View style={styles.headerActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.iconButton,
                    queueMode === 'saved' && styles.iconButtonSavedActive,
                    { opacity: pressed || interactionLocked ? 0.55 : 1 },
                  ]}
                  onPress={handleQueueModeToggle}
                  disabled={interactionLocked}
                  accessibilityLabel={queueMode === 'saved' ? 'Show all quests' : 'Show saved quests'}
                  testID="quest-saved-queue-button"
                >
                  <MaterialIcons
                    name={queueMode === 'saved' ? 'bookmark' : 'bookmark-border'}
                    size={22}
                    color={queueMode === 'saved' ? '#FFFFFF' : colors.text}
                  />
                  {showSavedQueueHint ? (
                    <View
                      pointerEvents="none"
                      style={styles.savedQueueHintDot}
                      testID="quest-saved-queue-dot"
                    />
                  ) : null}
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.iconButton, { opacity: pressed || loading || refreshing ? 0.55 : 1 }]}
                  onPress={() => loadChallenges({
                    showSpinner: challenges.length === 0,
                    mode: queueMode,
                    force: true,
                  })}
                  disabled={loading || refreshing}
                  accessibilityLabel="Refresh quests"
                  testID="quest-refresh-button"
                >
                  <MaterialIcons name="refresh" size={22} color={colors.text} />
                </Pressable>
                {showAdminQuestTools ? (
                  <Pressable
                    style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.55 : 1 }]}
                    onPress={() => router.push('/admin/quest-tags')}
                    accessibilityLabel="Open admin quest tagging"
                    testID="quest-admin-tags-button"
                  >
                    <MaterialIcons name="admin-panel-settings" size={22} color={colors.text} />
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.headerSearchRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.iconButton,
                    { opacity: pressed || !normalizedQuestSearchInput ? 0.55 : 1 },
                  ]}
                  onPress={handleQuestSearchSubmit}
                  disabled={!normalizedQuestSearchInput}
                  accessibilityLabel="Search quests"
                  testID="quest-search-button"
                >
                  <MaterialIcons name="search" size={22} color={colors.text} />
                </Pressable>
                <TextInput
                  style={[formStyles.input, styles.headerSearchInput, styles.headerSearchInputMinimal]}
                  placeholder="Search quests"
                  value={questSearchInput}
                  onChangeText={handleQuestSearchInputChange}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  onSubmitEditing={handleQuestSearchSubmit}
                  placeholderTextColor={colors.textMuted}
                  selectionColor={colors.primary}
                  cursorColor={colors.text}
                  testID="quest-search-input"
                />
              </View>
            </View>
          </View>

          {queueMode === 'saved' ? (
            <View style={styles.savedModeBanner} pointerEvents="none">
              <MaterialIcons name="bookmark" size={14} color={colors.primary} />
              <Text style={styles.savedModeBannerText}>
                Saved only — tap bookmark for all
              </Text>
            </View>
          ) : null}

          <View style={styles.stackStage} onLayout={handleStageLayout}>
            {showQuestTutorial && stack.length > 0 ? (
              <TutorialCallout
                title="Quests"
                body="Swipe to choose a quest, then tap or swipe to join!"
                testID="quests-tab-tutorial"
                style={[styles.questTutorialWrap, { width: questTutorialWidth }]}
                bubbleStyle={styles.questTutorialBubble}
                arrowPlacement="top"
                arrowSide="center"
              />
            ) : null}
            {loading ? (
              <View style={styles.centeredState}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.stateText}>Loading active challenges…</Text>
              </View>
            ) : stack.length === 0 ? (
              <View style={styles.centeredState}>
                <MaterialIcons name="explore-off" size={32} color={colors.textMuted} />
                <Text style={styles.stateText}>
                  {questSearchEnabled && challenges.length > 0
                    ? 'No quests found for that search.'
                    : hasActiveQuestFilter && challenges.length > 0
                      ? 'No quests found for that filter.'
                      : queueMode === 'saved'
                      ? 'No saved challenges yet.'
                      : 'No non-geo challenges yet.'}
                </Text>
              </View>
            ) : (
              stack
                .slice()
                .reverse()
                .map((challenge, reversedIndex) => {
                  const stackIndex = stack.length - reversedIndex - 1;
                  return renderChallengeCard(challenge, stackIndex);
                })
            )}
          </View>

          <PressHoldActionMenu
            visible={challengeOptions !== null}
            position={challengeOptionsPosition}
            menuSize={challengeMenuSize}
            titleLabel="Quest Options"
            title={challengeOptions?.challenge?.prompt || ''}
            subtitle={challengeOptions?.challenge?.creatorHandle || null}
            sections={challengeOptionSections}
            activeOptionId={activeChallengeOptionId}
            onRequestClose={closeChallengeOptions}
            onMenuLayout={handleChallengeMenuLayout}
            onOptionLayout={handleChallengeMenuOptionLayout}
            onOptionPress={handleChallengeMenuSelection}
          />

          <Toast message={toastMessage} bottomOffset={toastBottomOffset} />
        </View>
      </SafeAreaView>
    </TouchableWithoutFeedback>

      <Modal
        visible={friendSelectorVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setFriendSelectorVisible(false)}
      >
        <Pressable
          style={styles.friendSelectorOverlay}
          onPress={() => setFriendSelectorVisible(false)}
        >
          <Pressable style={styles.friendSelectorSheet} onPress={() => {}}>
            <View style={styles.friendSelectorDragHandle} />
            <Text style={styles.friendSelectorTitle}>Challenge a Friend</Text>
            {friendSelectorQuest ? (
              <Text style={styles.friendSelectorPrompt} numberOfLines={2}>
                "{friendSelectorQuest.prompt}"
              </Text>
            ) : null}
            {!friends?.length ? (
              <Text style={styles.friendSelectorEmpty}>Add friends to send them challenges.</Text>
            ) : (
              <FlatList
                data={friends}
                keyExtractor={(item) => item?.uid || item?.handle || String(Math.random())}
                renderItem={({ item: friend }) => {
                  const alreadySent = !!(
                    friendSelectorQuest?.pinId &&
                    sentChallengesRef.current[friendSelectorQuest.pinId]?.has(friend.uid)
                  );
                  return (
                    <Pressable
                      style={({ pressed }) => [
                        styles.friendSelectorRow,
                        alreadySent && styles.friendSelectorRowSent,
                        pressed && !alreadySent && !friendSelectorBusy ? styles.pressed : null,
                      ]}
                      onPress={() => {
                        if (alreadySent) {
                          showToast(`Already challenged ${friend.display_name || friend.handle || 'this friend'}`, 2200);
                          return;
                        }
                        if (!friendSelectorBusy) handleSendChallenge(friend);
                      }}
                      disabled={friendSelectorBusy}
                    >
                      <View style={styles.friendSelectorAvatar}>
                        <Text style={styles.friendSelectorAvatarText}>
                          {(friend.display_name || friend.handle || 'A').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.friendSelectorRowInfo}>
                        <Text style={[styles.friendSelectorName, alreadySent && styles.friendSelectorNameSent]}>
                          {friend.display_name || friend.handle || 'Friend'}
                        </Text>
                        {friend.handle ? (
                          <Text style={styles.friendSelectorHandleText}>@{friend.handle}</Text>
                        ) : null}
                      </View>
                      {alreadySent ? (
                        <Text style={styles.friendSelectorSentLabel}>Sent</Text>
                      ) : (
                        <MaterialIcons name="send" size={18} color={colors.primary || '#4A90D9'} />
                      )}
                    </Pressable>
                  );
                }}
                style={styles.friendSelectorList}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    container: {
      flex: 1,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
    },
    headerRow: {
      alignItems: 'center',
      marginBottom: spacing.sm,
      gap: spacing.xs,
    },
    questFilterScroller: {
      alignSelf: 'center',
      flexGrow: 0,
    },
    questFilterContent: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: 2,
      paddingRight: spacing.md,
    },
    questFilterChip: {
      minHeight: 32,
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    questFilterChipSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    questFilterChipPressed: {
      opacity: 0.78,
    },
    questFilterChipText: {
      ...textStyles.buttonSmall,
      color: colors.primary,
      letterSpacing: 0.2,
    },
    questFilterChipTextSelected: {
      color: colors.primaryTextOn || '#FFFFFF',
    },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg,
      position: 'relative',
      overflow: 'visible',
    },
    iconButtonSavedActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    savedModeBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      paddingVertical: 6,
      paddingHorizontal: spacing.md,
    },
    savedModeBannerText: {
      ...textStyles.bodyXsStrong,
      color: colors.textMuted,
      textAlign: 'center',
    },
    savedQueueHintDot: {
      position: 'absolute',
      top: 9,
      right: 9,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    headerTextBlock: {
      flex: 1,
      minWidth: 0,
    },
    headerControlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    headerTitle: {
      alignSelf: 'flex-start',
      ...textStyles.headingLg,
      color: colors.primary,
    },
    statusBannerOverlay: {
      position: 'absolute',
      top: spacing.sm,
      left: spacing.md,
      right: spacing.md,
      zIndex: 30,
    },
    statusBanner: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    statusBannerOffline: {
      backgroundColor: 'rgba(220,38,38,0.08)',
      borderColor: 'rgba(220,38,38,0.18)',
    },
    statusBannerText: {
      ...textStyles.bodyXsStrong,
      color: colors.textMuted,
      textAlign: 'center',
    },
    headerSearchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: spacing.sm,
      minWidth: 0,
    },
    headerSearchInput: {
      flex: 1,
      height: 44,
      borderRadius: 16,
      paddingVertical: 0,
    },
    headerSearchInputMinimal: {
      borderWidth: 0,
      backgroundColor: 'transparent',
      paddingHorizontal: 0,
    },
    headerToggleButton: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 2,
    },
    headerToggleText: {
      ...textStyles.buttonCaps,
      letterSpacing: 0.8,
      color: colors.primary,
    },
    stackStage: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    questTutorialWrap: {
      position: 'absolute',
      bottom: spacing.lg,
      alignItems: 'center',
      zIndex: 25,
    },
    questTutorialBubble: {
      alignSelf: 'center',
    },
    centeredState: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    stateText: {
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
      textAlign: 'center',
    },
    cardShell: {
      position: 'absolute',
      borderRadius: 40,
      overflow: 'hidden',
      backgroundColor: '#D9D0C9',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.16,
      shadowRadius: 24,
      elevation: 14,
    },
    cardShellContextActive: {
      borderColor: 'rgba(255,107,53,0.38)',
      shadowOpacity: 0.22,
      shadowRadius: 28,
      elevation: 18,
    },
    cardInner: {
      flex: 1,
      position: 'relative',
      backgroundColor: '#D9D0C9',
    },
    cardImage: {
      ...StyleSheet.absoluteFillObject,
    },
    cardImageFallback: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary_darkened || colors.primary,
    },
    dimLayer: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.26)',
    },
    topMeta: {
      position: 'absolute',
      top: 18,
      left: 16,
      right: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.xs,
    },
    cardTagRail: {
      flex: 1,
      minWidth: 0,
      marginRight: spacing.xs,
    },
    cardTagList: {
      alignItems: 'center',
      gap: spacing.xs,
      paddingRight: spacing.xs,
    },
    cardTagChip: {
      borderRadius: radii.pill,
      backgroundColor: 'rgba(0,0,0,0.25)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    cardTagChipText: {
      ...textStyles.eyebrow,
      color: colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 1.1,
    },
    creatorChip: {
      borderRadius: radii.pill,
      backgroundColor: 'rgba(255,255,255,0.92)',
      paddingHorizontal: 10,
      paddingVertical: 6,
      maxWidth: 170,
    },
    creatorChipText: {
      ...textStyles.eyebrow,
      color: colors.primary,
      letterSpacing: 0.4,
    },
    handleChip: {
      borderRadius: radii.pill,
      backgroundColor: 'rgba(0,0,0,0.25)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
      paddingHorizontal: 10,
      paddingVertical: 6,
      maxWidth: 160,
    },
    handleChipText: {
      ...textStyles.eyebrow,
      color: colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 1.1,
    },
    cardIconButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(0,0,0,0.25)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    challengeBannerContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      flex: 1,
      minWidth: 0,
    },
    challengeBannerLabel: {
      ...textStyles.eyebrow,
      color: '#FFFFFF',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      flex: 1,
      flexShrink: 1,
    },
    challengeBannerRow: {
      position: 'absolute',
      top: 62,
      left: 16,
      right: 16,
    },
    promptBlockShifted: {
      top: 106,
    },
    cardIconButtonInactive: {
      opacity: 0.72,
    },
    cardIconButtonPressed: {
      backgroundColor: 'rgba(0,0,0,0.38)',
    },
    photoCountChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: radii.pill,
      backgroundColor: 'rgba(0,0,0,0.25)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
      paddingHorizontal: 10,
      paddingVertical: 6,
      maxWidth: 96,
    },
    photoCountText: {
      ...textStyles.chip,
      color: '#FFFFFF',
    },
    promptBlock: {
      position: 'absolute',
      left: 16,
      right: 16,
      top: 70,
    },
    promptText: {
      ...textStyles.heading,
      color: '#FFFFFF',
      lineHeight: 28,
    },
    bottomTeaser: {
      position: 'absolute',
      left: 22,
      right: 16,
      bottom: 20,
      gap: 4,
    },
    bottomPhotoCount: {
      position: 'absolute',
      right: 16,
      bottom: 20,
      alignItems: 'flex-end',
    },
    bottomPhotoCountPressed: {
      opacity: 0.72,
    },
    bottomTeaserRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      width: '100%',
    },
    bottomTeaserLabel: {
      ...textStyles.bodySmallBold,
      flex: 1,
      color: '#FFFFFF',
      lineHeight: 17,
    },
    bottomTeaserComment: {
      ...textStyles.bodySmallStrong,
      flex: 1,
      color: '#FFFFFF',
      lineHeight: 17,
    },
    bottomTeaserHandle: {
      ...textStyles.bodySmallBold,
      color: colors.primary,
    },
    selectBadge: {
      position: 'absolute',
      top: 26,
      left: 20,
      zIndex: 12,
      backgroundColor: colors.primary,
      borderRadius: radii.pill,
      paddingHorizontal: 14,
      paddingVertical: 8,
      transform: [{ rotate: '-14deg' }],
    },
    selectBadgeText: {
      ...textStyles.buttonCaps,
      color: '#FFFFFF',
      letterSpacing: 0.6,
    },
    skipBadge: {
      position: 'absolute',
      top: 26,
      right: 20,
      zIndex: 12,
      borderWidth: 3,
      borderColor: 'rgba(255,255,255,0.75)',
      borderRadius: radii.pill,
      paddingHorizontal: 14,
      paddingVertical: 6,
      transform: [{ rotate: '14deg' }],
    },
    skipBadgeText: {
      ...textStyles.buttonCaps,
      color: '#FFFFFF',
      letterSpacing: 0.6,
    },
    saveBadge: {
      position: 'absolute',
      top: 28,
      alignSelf: 'center',
      zIndex: 12,
      borderRadius: radii.pill,
      borderWidth: 3,
      borderColor: 'rgba(255,255,255,0.82)',
      backgroundColor: 'rgba(0,0,0,0.38)',
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    saveBadgeText: {
      ...textStyles.buttonCaps,
      color: '#FFFFFF',
      letterSpacing: 0.6,
    },
    friendSelectorOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    friendSelectorSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: spacing.md,
      paddingTop: 12,
      paddingBottom: 32,
      maxHeight: '75%',
    },
    friendSelectorDragHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border || '#ccc',
      alignSelf: 'center',
      marginBottom: 16,
    },
    friendSelectorTitle: {
      ...textStyles.title3,
      color: colors.text,
      marginBottom: 6,
    },
    friendSelectorPrompt: {
      ...textStyles.body,
      color: colors.textSecondary || colors.text,
      marginBottom: 14,
      fontStyle: 'italic',
    },
    friendSelectorEmpty: {
      ...textStyles.body,
      color: colors.textSecondary || colors.text,
      textAlign: 'center',
      marginTop: 24,
      marginBottom: 24,
    },
    friendSelectorList: {
      flexGrow: 0,
    },
    friendSelectorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border || '#eee',
    },
    friendSelectorRowSent: {
      opacity: 0.45,
    },
    friendSelectorAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary || '#4A90D9',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    friendSelectorAvatarText: {
      ...textStyles.title3,
      color: '#FFFFFF',
    },
    friendSelectorRowInfo: {
      flex: 1,
    },
    friendSelectorName: {
      ...textStyles.body,
      color: colors.text,
      fontWeight: '600',
    },
    friendSelectorNameSent: {
      color: colors.textSecondary || colors.text,
    },
    friendSelectorHandleText: {
      ...textStyles.caption,
      color: colors.textSecondary || colors.text,
    },
    friendSelectorSentLabel: {
      ...textStyles.caption,
      color: colors.textSecondary || colors.text,
    },
  });
}
