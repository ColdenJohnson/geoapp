import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  Pressable,
  SafeAreaView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  fetchRankedQuests,
  fetchSavedQuests,
  saveQuest,
  unsaveQuest
} from '@/lib/api';
import { buildViewPhotoChallengeRoute } from '@/lib/navigation';
import { setUploadSubmitResolver } from '@/lib/promiseStore';
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
import { usePalette } from '@/hooks/usePalette';
import { PUBLIC_BASE_URL } from '@/lib/apiClient';
import { spacing, radii } from '@/theme/tokens';

const CARD_ASPECT_RATIO = 3 / 4;
const SWIPE_THRESHOLD = 110;
const SWIPE_UP_THRESHOLD = 110;
const STACK_DEPTH = 3;
const LONG_PRESS_DELAY_MS = 380;
const LONG_PRESS_CANCEL_DISTANCE = 8;
const TAP_OPEN_MAX_DISTANCE = 8;
const SESSION_CHALLENGE_CACHE = {
  all: null,
  saved: null,
};

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

function normalizeChallengePin(pin, index) {
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
  };
}

export default function ActiveChallengesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomTabOverflow = useBottomTabOverflow();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { message: toastMessage, show: showToast } = useToast(3000);

  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);
  const [uploadingPinId, setUploadingPinId] = useState(null);
  const [queueMode, setQueueMode] = useState('all');
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [challengeOptions, setChallengeOptions] = useState(null);
  const [challengeMenuSize, setChallengeMenuSize] = useState(PRESS_HOLD_ACTION_MENU_DEFAULT_SIZE);
  const [activeChallengeOptionId, setActiveChallengeOptionId] = useState(null);
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
      stageWidth * 0.95,
      stageHeight * CARD_ASPECT_RATIO * 0.9,
      400,
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

  const loadChallenges = useCallback(async ({ showSpinner = true, mode = 'all', force = false } = {}) => {
    const cachedRows = force ? null : SESSION_CHALLENGE_CACHE[mode];
    if (Array.isArray(cachedRows)) {
      setChallenges(cachedRows);
      setLoading(false);
      return true;
    }
    if (showSpinner) {
      setLoading(true);
    }
    try {
      const rows = mode === 'saved'
        ? await fetchSavedQuests()
        : await fetchRankedQuests({ includeRankingDebug: true });
      const sorted = Array.isArray(rows) ? rows : [];
      const normalizedChallenges = sorted.map((pin, index) => normalizeChallengePin(pin, index));
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
      SESSION_CHALLENGE_CACHE[mode] = hydratedChallenges;
      setChallenges(hydratedChallenges);
      return true;
    } catch (error) {
      console.error('Failed to fetch active challenges', error);
      return false;
    } finally {
      if (showSpinner) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadChallenges({ showSpinner: true, mode: queueMode });
  }, [loadChallenges, queueMode]);

  useEffect(() => {
    closeChallengeOptions();
  }, [closeChallengeOptions, queueMode]);

  const advanceChallengeQueue = useCallback((direction) => {
    setChallenges((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;
      let next = prev;
      if (direction === 'save' && queueMode === 'saved') {
        next = prev.slice(1);
        SESSION_CHALLENGE_CACHE[queueMode] = next;
        return next;
      }
      if (prev.length < 2) return prev;
      const [first, ...rest] = prev;
      next = [...rest, first];
      SESSION_CHALLENGE_CACHE[queueMode] = next;
      return next;
    });
  }, [queueMode]);

  const beginUploadForChallenge = useCallback((challenge) => {
    if (!challenge?.pinId) return;
    const uploadRequestId = `quest-upload-${challenge.pinId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setUploadingPinId(challenge.pinId);
    setUploadSubmitResolver((submitResult) => {
      if (submitResult?.submitted) {
        advanceChallengeQueue('upload');
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
  }, [advanceChallengeQueue, router]);

  const handleUpSwipeAction = useCallback(async (challenge) => {
    if (!challenge?.pinId) return;
    if (queueMode === 'saved') {
      const result = await unsaveQuest(challenge.pinId);
      if (!result?.success) {
        showToast('Unsave failed', 2500);
        return;
      }
      showToast('Removed from saved', 2200);
      return;
    }
    const result = await saveQuest(challenge.pinId);
    if (!result?.success) {
      showToast('Save failed', 2500);
      return;
    }
    if (!result?.alreadySaved) {
      showToast('Saved for later', 2200);
    }
  }, [queueMode, showToast]);

  const handleShareChallenge = useCallback(async (challenge) => {
    if (!challenge?.pinId) return;
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
  }, [showToast]);

  const handleSaveChallenge = useCallback(async (challenge) => {
    if (!challenge?.pinId) return;
    const result = await saveQuest(challenge.pinId);
    if (!result?.success) {
      showToast('Save failed', 2500);
      return;
    }
    if (result?.alreadySaved || queueMode === 'saved') {
      showToast('Already saved', 2200);
      return;
    }
    showToast('Saved for later', 2200);
  }, [queueMode, showToast]);

  const handleViewPhotos = useCallback((challenge) => {
    if (!challenge?.pinId) return;
    router.push(buildViewPhotoChallengeRoute({
      pinId: challenge.pinId,
      message: challenge.prompt,
      createdByHandle: challenge.creatorHandleRaw || '',
    }));
  }, [router]);

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
    challengeOptionLayoutsRef.current = {};
    lastMenuTouchPointRef.current = null;
    setActiveChallengeOptionId(null);
    setChallengeMenuSize(PRESS_HOLD_ACTION_MENU_DEFAULT_SIZE);
    cardPan.stopAnimation();
    cardPan.setValue({ x: 0, y: 0 });
    setChallengeOptions({ challenge, x, y });
    triggerMenuOpenHaptic();
  }, [cardPan, triggerMenuOpenHaptic]);

  const commitSwipe = useCallback((direction) => {
    if (swipeLocked || challenges.length === 0) return;
    closeChallengeOptions();
    const topChallenge = challenges[0];
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
        advanceChallengeQueue(direction);
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
    cardHeight,
    cardPan,
    cardWidth,
    challenges,
    closeChallengeOptions,
    beginUploadForChallenge,
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
    onStartShouldSetPanResponder: () => !interactionLocked && challenges.length > 0,
    onMoveShouldSetPanResponder: (_, gestureState) =>
      !interactionLocked &&
      challenges.length > 0 &&
      (Math.abs(gestureState.dx) > 6 || Math.abs(gestureState.dy) > 6),
    onPanResponderGrant: (_, gestureState) => {
      startLongPress(challenges[0], gestureState.x0, gestureState.y0);
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
        challenges[0]?.pinId
      ) {
        openChallengeOptions(
          challenges[0],
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
    challenges,
    clearLongPressTimer,
    closeChallengeOptions,
    commitSwipe,
    handleChallengeMenuSelection,
    interactionLocked,
    openChallengeOptions,
    resetCardPosition,
    startLongPress,
    syncChallengeOptionHighlight,
  ]);

  const stack = challenges.slice(0, STACK_DEPTH);
  const activeChallenge = stack[0] ?? null;
  const panTargetPinId = swipeAnimatingPinId.current ?? activeChallenge?.pinId ?? null;
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
    const friendParticipationLabel = formatFriendParticipationLabel(challenge.friendParticipantCount);
    const teaserComment = challenge.teaserTopComment;
    const showsBottomTeaser = !!friendParticipationLabel || !!teaserComment?.text;

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
            <View style={styles.handleChip}>
              <Text style={styles.handleChipText}>{challenge.featuredPhotoHandle}</Text>
            </View>
          </View>

          <View style={styles.promptBlock}>
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

          <View style={styles.bottomPhotoCount}>
            <View style={styles.photoCountChip}>
              <MaterialIcons name="photo-library" size={13} color="#FFFFFF" />
              <Text style={styles.photoCountText}>{challenge.uploadsCount}</Text>
            </View>
          </View>
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
    interactionLocked,
  ]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.container, { paddingTop: spacing.sm, paddingBottom: footerSafePadding + spacing.md }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerTextBlock}>
            <Text style={styles.headerTitle}>Quests</Text>
            <Text style={styles.headerSubtitle}>
              {queueMode === 'saved'
                ? 'Swipe up to remove from saved. Tap or hold for more.'
                : 'Swipe right to add a photo, left to send back, up to save. Tap or hold for more.'}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={({ pressed }) => [
                styles.headerToggleButton,
                { opacity: pressed || interactionLocked ? 0.55 : 1 },
              ]}
              onPress={() => {
                setQueueMode((prev) => (prev === 'saved' ? 'all' : 'saved'));
              }}
              disabled={interactionLocked}
            >
              <Text style={styles.headerToggleText}>
                {queueMode === 'saved' ? 'All' : 'Saved'}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.iconButton, { opacity: pressed || loading ? 0.55 : 1 }]}
              onPress={() => loadChallenges({ showSpinner: true, mode: queueMode, force: true })}
              disabled={loading}
            >
              <MaterialIcons name="refresh" size={22} color={colors.text} />
            </Pressable>
          </View>
        </View>

        <View style={styles.stackStage} onLayout={handleStageLayout}>
          {loading ? (
            <View style={styles.centeredState}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.stateText}>Loading active challenges…</Text>
            </View>
          ) : stack.length === 0 ? (
            <View style={styles.centeredState}>
              <MaterialIcons name="explore-off" size={32} color={colors.textMuted} />
              <Text style={styles.stateText}>
                {queueMode === 'saved' ? 'No saved challenges yet.' : 'No non-geo challenges yet.'}
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

        <View style={styles.footerButtons}>
          <Pressable
            style={({ pressed }) => [
              styles.footerButton,
              styles.skipFooterButton,
              { opacity: pressed || interactionLocked || !activeChallenge ? 0.6 : 1 },
            ]}
            onPress={() => commitSwipe('skip')}
            accessibilityLabel="Skip quest"
            disabled={interactionLocked || !activeChallenge}
          >
            <MaterialIcons name="close" size={28} color={colors.textMuted} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.footerButton,
              styles.viewFooterButton,
              { opacity: pressed || interactionLocked || !activeChallenge ? 0.75 : 1 },
            ]}
            onPress={() => handleViewPhotos(activeChallenge)}
            accessibilityLabel="View quest photos"
            disabled={interactionLocked || !activeChallenge}
          >
            <MaterialIcons name="photo-library" size={28} color={colors.textMuted} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.footerButton,
              styles.cameraFooterButton,
              { opacity: pressed || interactionLocked || !activeChallenge ? 0.75 : 1 },
            ]}
            onPress={() => commitSwipe('accept')}
            accessibilityLabel="Add photo to quest"
            disabled={interactionLocked || !activeChallenge}
          >
            <MaterialIcons name="photo-camera" size={28} color={colors.primaryTextOn} />
          </Pressable>
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
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
      gap: spacing.sm,
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
    },
    headerTextBlock: {
      flex: 1,
      minHeight: 44,
      justifyContent: 'center',
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    headerTitle: {
      fontSize: 30,
      lineHeight: 34,
      fontWeight: '900',
      color: colors.primary,
      letterSpacing: -0.3,
    },
    headerSubtitle: {
      marginTop: 2,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.7,
      color: colors.textMuted,
      textTransform: 'uppercase',
    },
    headerToggleButton: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 2,
    },
    headerToggleText: {
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 0.8,
      color: colors.primary,
      textTransform: 'uppercase',
    },
    stackStage: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    centeredState: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    stateText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textMuted,
      textAlign: 'center',
    },
    cardShell: {
      position: 'absolute',
      borderRadius: 40,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.07)',
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
    creatorChip: {
      borderRadius: radii.pill,
      backgroundColor: 'rgba(255,255,255,0.92)',
      paddingHorizontal: 10,
      paddingVertical: 6,
      maxWidth: 170,
    },
    creatorChipText: {
      color: colors.primary,
      fontSize: 10,
      letterSpacing: 0.4,
      fontWeight: '800',
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
      color: colors.primary,
      fontSize: 10,
      textTransform: 'uppercase',
      letterSpacing: 1.1,
      fontWeight: '900',
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
      color: '#FFFFFF',
      fontWeight: '900',
      fontSize: 12,
    },
    promptBlock: {
      position: 'absolute',
      left: 16,
      right: 16,
      top: 70,
    },
    promptText: {
      color: '#FFFFFF',
      fontSize: 24,
      lineHeight: 28,
      fontWeight: '900',
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
    bottomTeaserRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      width: '100%',
    },
    bottomTeaserLabel: {
      flex: 1,
      color: '#FFFFFF',
      fontWeight: '900',
      fontSize: 13,
      lineHeight: 17,
    },
    bottomTeaserComment: {
      flex: 1,
      color: '#FFFFFF',
      fontSize: 13,
      lineHeight: 17,
      fontWeight: '700',
    },
    bottomTeaserHandle: {
      color: colors.primary,
      fontWeight: '900',
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
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '900',
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
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '900',
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
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '900',
      letterSpacing: 0.6,
    },
    footerButtons: {
      marginTop: spacing.md,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.xl,
    },
    footerButton: {
      width: 68,
      height: 68,
      borderRadius: 34,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 14,
      shadowOpacity: 0.12,
      elevation: 8,
    },
    skipFooterButton: {
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    viewFooterButton: {
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    cameraFooterButton: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
  });
}
