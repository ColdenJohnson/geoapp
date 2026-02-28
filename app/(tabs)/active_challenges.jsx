import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addPhoto, fetchAllLocationPins } from '@/lib/api';
import { setUploadResolver } from '@/lib/promiseStore';
import { AuthContext } from '@/hooks/AuthContext';
import { useBottomTabOverflow } from '@/components/ui/TabBarBackground';
import { Toast, useToast } from '@/components/ui/Toast';
import { usePalette } from '@/hooks/usePalette';
import { spacing, radii } from '@/theme/tokens';

const CARD_ASPECT_RATIO = 9 / 16;
const SWIPE_THRESHOLD = 110;
const STACK_DEPTH = 3;
const SWIPE_ANIMATION_TIMEOUT_MS = 700;
const SWIPE_DEBUG = typeof __DEV__ !== 'undefined' && __DEV__;

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
  const teaserPhoto = typeof pin?.most_recent_photo_url === 'string' && pin.most_recent_photo_url
    ? pin.most_recent_photo_url
    : null;

  return {
    pinId,
    prompt,
    creatorHandle: handle.startsWith('@') ? handle : `@${handle}`,
    creatorName,
    uploadsCount,
    teaserPhoto,
  };
}

export default function ActiveChallengesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomTabOverflow = useBottomTabOverflow();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { invalidateStats } = useContext(AuthContext);
  const { message: toastMessage, show: showToast, hide: hideToast } = useToast(3000);

  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);
  const [uploadingPinId, setUploadingPinId] = useState(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [swipeAnimatingPinId, setSwipeAnimatingPinId] = useState(null);
  const [cardPan, setCardPan] = useState(() => new Animated.ValueXY());
  const stackTransition = useRef(new Animated.Value(1)).current;
  const swipeCounterRef = useRef(0);
  const swipeWatchdogRef = useRef(null);
  const activeSwipeTokenRef = useRef(0);

  const debugLog = useCallback((event, payload = null) => {
    if (!SWIPE_DEBUG) return;
    if (payload) {
      console.log(`[active_challenges] ${event}`, payload);
      return;
    }
    console.log(`[active_challenges] ${event}`);
  }, []);

  const getPanSnapshot = useCallback(() => {
    const x = typeof cardPan?.x?.__getValue === 'function' ? Number(cardPan.x.__getValue()) : null;
    const y = typeof cardPan?.y?.__getValue === 'function' ? Number(cardPan.y.__getValue()) : null;
    return { x, y };
  }, [cardPan]);

  const clearSwipeWatchdog = useCallback(() => {
    if (swipeWatchdogRef.current) {
      clearTimeout(swipeWatchdogRef.current);
      swipeWatchdogRef.current = null;
    }
  }, []);

  const resetCardPan = useCallback((reason, payload = null) => {
    cardPan.stopAnimation((value) => {
      cardPan.setValue({ x: 0, y: 0 });
      debugLog('pan:reset', {
        reason,
        before: value,
        ...(payload || {}),
      });
    });
  }, [cardPan, debugLog]);

  useEffect(() => () => {
    clearSwipeWatchdog();
  }, [clearSwipeWatchdog]);

  useEffect(() => {
    setCardPan(new Animated.ValueXY());
  }, []);

  const stageWidth = stageSize.width || Math.max(windowWidth - spacing.md * 2, 0);
  const stageHeight = stageSize.height || Math.max(windowHeight - 260, 0);
  const cardWidth = Math.max(
    180,
    Math.min(
      stageWidth * 0.9,
      stageHeight * CARD_ASPECT_RATIO * 0.92,
      340,
    ),
  );
  const cardRotate = cardPan.x.interpolate({
    inputRange: [-cardWidth, 0, cardWidth],
    outputRange: ['-12deg', '0deg', '12deg'],
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
  const footerSafePadding = Math.max(0, insets.bottom + bottomTabOverflow);
  const toastBottomOffset = footerSafePadding + 22;
  const swipeLocked = loading || isAnimating || uploadingPinId !== null;

  const loadChallenges = useCallback(async ({ showSpinner = true } = {}) => {
    if (showSpinner) {
      setLoading(true);
    }
    try {
      const rows = await fetchAllLocationPins({ isGeoLocked: false });
      const sorted = Array.isArray(rows)
        ? [...rows].sort((a, b) => {
            const left = Date.parse(a?.updatedAt || 0);
            const right = Date.parse(b?.updatedAt || 0);
            return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
          })
        : [];
      setChallenges(sorted.map((pin, index) => normalizeChallengePin(pin, index)));
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
    loadChallenges({ showSpinner: true });
  }, [loadChallenges]);

  const cycleTopChallenge = useCallback(() => {
    setChallenges((prev) => {
      if (!Array.isArray(prev) || prev.length < 2) return prev;
      const [first, ...rest] = prev;
      return [...rest, first];
    });
  }, []);

  const applyUploadToChallenge = useCallback((pinId, fileUrl) => {
    setChallenges((prev) => {
      if (!Array.isArray(prev)) return prev;
      return prev.map((challenge) => {
        if (challenge.pinId !== pinId) return challenge;
        return {
          ...challenge,
          uploadsCount: challenge.uploadsCount + 1,
          teaserPhoto: fileUrl || challenge.teaserPhoto,
        };
      });
    });
  }, []);

  const beginUploadForChallenge = useCallback(async (challenge) => {
    if (!challenge?.pinId) return;
    setUploadingPinId(challenge.pinId);
    try {
      const uploadedPhotoUrl = await new Promise((resolve) => {
        setUploadResolver(resolve);
        router.push({
          pathname: '/upload',
          params: {
            prompt: challenge.prompt,
          },
        });
      });

      if (!uploadedPhotoUrl) {
        return;
      }
      showToast('Uploading photo…', 60000);
      await addPhoto(challenge.pinId, uploadedPhotoUrl);
      applyUploadToChallenge(challenge.pinId, uploadedPhotoUrl);
      invalidateStats();
      hideToast();
      showToast('Upload success', 2200);
    } catch (error) {
      console.error('Failed to upload photo to challenge', error);
      hideToast();
      showToast('Upload failed', 2500);
    } finally {
      setUploadingPinId(null);
    }
  }, [applyUploadToChallenge, hideToast, invalidateStats, router, showToast]);

  const commitSwipe = useCallback((direction) => {
    if (swipeLocked || challenges.length === 0) return;
    const topChallenge = challenges[0];
    const swipeId = ++swipeCounterRef.current;
    const swipeToken = Date.now() + swipeId;
    activeSwipeTokenRef.current = swipeToken;
    debugLog('swipe:start', {
      swipeId,
      direction,
      topPinId: topChallenge?.pinId || null,
      challengesLength: challenges.length,
      pan: getPanSnapshot(),
      swipeLocked,
    });
    clearSwipeWatchdog();
    swipeWatchdogRef.current = setTimeout(() => {
      if (activeSwipeTokenRef.current !== swipeToken) {
        return;
      }
      debugLog('swipe:watchdog-timeout', {
        swipeId,
        direction,
        topPinId: topChallenge?.pinId || null,
        pan: getPanSnapshot(),
      });
      activeSwipeTokenRef.current = 0;
      resetCardPan('watchdog-timeout', { swipeId });
      setSwipeAnimatingPinId(null);
      setIsAnimating(false);
    }, SWIPE_ANIMATION_TIMEOUT_MS);
    setSwipeAnimatingPinId(topChallenge.pinId);
    const exitX = direction === 'accept' ? cardWidth + 180 : -cardWidth - 180;
    setIsAnimating(true);
    Animated.timing(cardPan, {
      toValue: { x: exitX, y: 0 },
      duration: 200,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (activeSwipeTokenRef.current !== swipeToken) {
        debugLog('swipe:ignored-stale-callback', { swipeId, finished });
        return;
      }
      activeSwipeTokenRef.current = 0;
      clearSwipeWatchdog();
      debugLog('swipe:timing-complete', {
        swipeId,
        finished,
        direction,
        topPinId: topChallenge?.pinId || null,
        pan: getPanSnapshot(),
      });
      if (!finished) {
        resetCardPan('timing-finished-false', { swipeId });
        setSwipeAnimatingPinId(null);
        setIsAnimating(false);
        debugLog('swipe:aborted-reset', { swipeId, pan: getPanSnapshot() });
        return;
      }
      // TODO(active_challenges): Known visual glitch window starts here.
      // During the frame(s) after deck rotation and before post-cycle reset,
      // the incoming top card can briefly render at an out-of-flow position
      // (outside the expected transition path) before settling and animating in.
      // Logs that capture this window:
      // - swipe:timing-complete
      // - swipe:cycled-deck
      // - deck:state (isAnimating=true with reversed stackPinIds)
      cycleTopChallenge();
      debugLog('swipe:cycled-deck', {
        swipeId,
        nextTopPinId: challenges[1]?.pinId || challenges[0]?.pinId || null,
      });
      requestAnimationFrame(() => {
        // TODO(active_challenges): End of known glitch window.
        // Normalization starts here (pan reset + transition bootstrap + unlock).
        // If flicker appears before this callback, investigate initial transform values
        // used by the incoming top card right after cycleTopChallenge().
        resetCardPan('post-cycle-reset', { swipeId });
        setSwipeAnimatingPinId(null);
        stackTransition.stopAnimation();
        stackTransition.setValue(0);
        Animated.timing(stackTransition, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
        setIsAnimating(false);
        debugLog('swipe:post-cycle-reset', {
          swipeId,
          pan: getPanSnapshot(),
        });
        requestAnimationFrame(() => {
          debugLog('swipe:post-cycle-next-frame', {
            swipeId,
            pan: getPanSnapshot(),
          });
        });
        if (direction === 'accept') {
          beginUploadForChallenge(topChallenge);
        }
      });
    });
  }, [
    beginUploadForChallenge,
    cardPan,
    cardWidth,
    challenges,
    clearSwipeWatchdog,
    cycleTopChallenge,
    stackTransition,
    debugLog,
    getPanSnapshot,
    resetCardPan,
    swipeLocked,
  ]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !swipeLocked && challenges.length > 0,
    onMoveShouldSetPanResponder: (_, gestureState) =>
      !swipeLocked &&
      challenges.length > 0 &&
      Math.abs(gestureState.dx) > 6,
    onPanResponderMove: Animated.event([null, { dx: cardPan.x, dy: cardPan.y }], {
      useNativeDriver: false,
    }),
    onPanResponderRelease: (_, gestureState) => {
      debugLog('gesture:release', {
        dx: gestureState.dx,
        dy: gestureState.dy,
        topPinId: challenges[0]?.pinId || null,
        swipeLocked,
      });
      if (gestureState.dx > SWIPE_THRESHOLD) {
        debugLog('gesture:decision', { direction: 'accept', reason: 'dx-threshold' });
        commitSwipe('accept');
        return;
      }
      if (gestureState.dx < -SWIPE_THRESHOLD) {
        debugLog('gesture:decision', { direction: 'skip', reason: 'dx-threshold' });
        commitSwipe('skip');
        return;
      }
      debugLog('gesture:decision', { direction: 'reset', reason: 'below-threshold' });
      Animated.spring(cardPan, {
        toValue: { x: 0, y: 0 },
        useNativeDriver: false,
        damping: 17,
        stiffness: 170,
      }).start();
    },
    onPanResponderTerminate: () => {
      debugLog('gesture:terminate', {
        topPinId: challenges[0]?.pinId || null,
        pan: getPanSnapshot(),
      });
      Animated.spring(cardPan, {
        toValue: { x: 0, y: 0 },
        useNativeDriver: false,
        damping: 17,
        stiffness: 170,
      }).start();
    },
  }), [cardPan, challenges, commitSwipe, debugLog, getPanSnapshot, swipeLocked]);

  const stack = useMemo(() => challenges.slice(0, STACK_DEPTH), [challenges]);
  const stackPinIds = useMemo(() => stack.map((challenge) => challenge.pinId), [stack]);
  // TODO(active_challenges): During dismiss handoff, verify this target aligns with
  // the incoming top card's first rendered transform to avoid one-frame jumps to
  // out-of-flow positions before the stage-in transition starts.
  const panTargetPinId = swipeAnimatingPinId ?? stack[0]?.pinId ?? null;

  useEffect(() => {
    debugLog('deck:state', {
      stackPinIds,
      panTargetPinId,
      swipeAnimatingPinId,
      isAnimating,
      swipeLocked,
      uploadingPinId,
    });
  }, [debugLog, isAnimating, panTargetPinId, stackPinIds, swipeAnimatingPinId, swipeLocked, uploadingPinId]);

  useEffect(() => {
    if (!swipeAnimatingPinId || isAnimating) return;
    const animatingPinExistsInStack = stackPinIds.includes(swipeAnimatingPinId);
    if (animatingPinExistsInStack) return;
    debugLog('deck:stale-animating-pin-reset', {
      swipeAnimatingPinId,
      stackPinIds,
      pan: getPanSnapshot(),
    });
    resetCardPan('stale-animating-pin', { stackPinIds, swipeAnimatingPinId });
    setSwipeAnimatingPinId(null);
    setIsAnimating(false);
  }, [debugLog, getPanSnapshot, isAnimating, resetCardPan, stackPinIds, swipeAnimatingPinId]);
  const handleStageLayout = useCallback((event) => {
    const { width, height } = event.nativeEvent.layout;
    setStageSize((prev) => {
      if (prev.width === width && prev.height === height) {
        return prev;
      }
      return { width, height };
    });
  }, []);

  const renderChallengeCard = useCallback((challenge, stackIndex) => {
    const isTop = stackIndex === 0;
    const tracksPan = challenge.pinId === panTargetPinId || (!isAnimating && isTop);
    const fromStackIndex = Math.min(stackIndex + 1, STACK_DEPTH);
    const stackScale = stackTransition.interpolate({
      inputRange: [0, 1],
      outputRange: [1 - fromStackIndex * 0.05, 1 - stackIndex * 0.05],
    });
    const stackOffsetY = stackTransition.interpolate({
      inputRange: [0, 1],
      outputRange: [fromStackIndex * 12, stackIndex * 12],
    });
    const stackRotate = stackTransition.interpolate({
      inputRange: [0, 1],
      outputRange: [`${fromStackIndex * 1.5}deg`, `${stackIndex * 1.5}deg`],
    });
    const staticTransform = [
      { scale: stackScale },
      { translateY: stackOffsetY },
      { rotate: stackRotate },
    ];
    const topTransforms = tracksPan
      ? [{ translateX: cardPan.x }, { translateY: cardPan.y }, { rotate: cardRotate }]
      : [];

    return (
      <Animated.View
        key={challenge.pinId}
        style={[
          styles.cardShell,
          {
            width: cardWidth,
            aspectRatio: CARD_ASPECT_RATIO,
            zIndex: STACK_DEPTH - stackIndex,
            transform: [...staticTransform, ...topTransforms],
          },
        ]}
        {...(isTop && !swipeLocked ? panResponder.panHandlers : {})}
      >
        {isTop && tracksPan ? (
          <>
            <Animated.View style={[styles.selectBadge, { opacity: selectOpacity }]}>
              <Text style={styles.selectBadgeText}>SELECT</Text>
            </Animated.View>
            <Animated.View style={[styles.skipBadge, { opacity: skipOpacity }]}>
              <Text style={styles.skipBadgeText}>SKIP</Text>
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
              <Text style={styles.handleChipText}>{challenge.creatorHandle}</Text>
            </View>
          </View>

          <View style={styles.promptBlock}>
            <Text style={styles.promptText} numberOfLines={4}>
              "{challenge.prompt}"
            </Text>
          </View>

          <View style={styles.bottomMeta}>
            <View style={styles.metaRow}>
              <MaterialIcons name="photo-library" size={13} color="#FFFFFF" />
              <Text style={styles.uploadCountText}>
                {challenge.uploadsCount}
              </Text>
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
    stackTransition,
    panTargetPinId,
    panResponder.panHandlers,
    selectOpacity,
    skipOpacity,
    styles,
    isAnimating,
    swipeLocked,
  ]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.container, { paddingTop: spacing.sm, paddingBottom: footerSafePadding + spacing.md }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerTextBlock}>
            <Text style={styles.headerTitle}>Quests</Text>
            <Text style={styles.headerSubtitle}>
              Swipe right to accept, left to send it back.
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.55 : 1 }]}
            onPress={() => loadChallenges({ showSpinner: true })}
            disabled={loading}
          >
            <MaterialIcons name="refresh" size={22} color={colors.text} />
          </Pressable>
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
              <Text style={styles.stateText}>No non-geo challenges yet.</Text>
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
              { opacity: pressed || swipeLocked || stack.length === 0 ? 0.6 : 1 },
            ]}
            onPress={() => commitSwipe('skip')}
            disabled={swipeLocked || stack.length === 0}
          >
            <MaterialIcons name="close" size={28} color={colors.textMuted} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.footerButton,
              styles.acceptFooterButton,
              { opacity: pressed || swipeLocked || stack.length === 0 ? 0.75 : 1 },
            ]}
            onPress={() => commitSwipe('accept')}
            disabled={swipeLocked || stack.length === 0}
          >
            <MaterialIcons name="photo-camera" size={28} color={colors.primaryTextOn} />
          </Pressable>
        </View>

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
    stackStage: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'visible',
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
    bottomMeta: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: spacing.sm,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(0,0,0,0.25)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radii.pill,
      maxWidth: 175,
    },
    uploadCountText: {
      color: '#FFFFFF',
      fontWeight: '900',
      fontSize: 12,
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
    acceptFooterButton: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
  });
}
