import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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

const CARD_ASPECT_RATIO = 3 / 4;
const SWIPE_THRESHOLD = 110;
const STACK_DEPTH = 3;

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
  const cardPan = useRef(new Animated.ValueXY()).current;
  const swipeAnimatingPinId = useRef(null);

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
    swipeAnimatingPinId.current = topChallenge.pinId;
    const exitX = direction === 'accept' ? cardWidth + 180 : -cardWidth - 180;
    setIsAnimating(true);
    Animated.timing(cardPan, {
      toValue: { x: exitX, y: 0 },
      duration: 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      cycleTopChallenge();
      requestAnimationFrame(() => {
        cardPan.setValue({ x: 0, y: 0 });
        swipeAnimatingPinId.current = null;
        setIsAnimating(false);
        if (finished && direction === 'accept') {
          beginUploadForChallenge(topChallenge);
        }
      });
    });
  }, [beginUploadForChallenge, cardPan, cardWidth, challenges, cycleTopChallenge, swipeLocked]);

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
      if (gestureState.dx > SWIPE_THRESHOLD) {
        commitSwipe('accept');
        return;
      }
      if (gestureState.dx < -SWIPE_THRESHOLD) {
        commitSwipe('skip');
        return;
      }
      Animated.spring(cardPan, {
        toValue: { x: 0, y: 0 },
        useNativeDriver: true,
        damping: 17,
        stiffness: 170,
      }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(cardPan, {
        toValue: { x: 0, y: 0 },
        useNativeDriver: true,
        damping: 17,
        stiffness: 170,
      }).start();
    },
  }), [cardPan, challenges.length, commitSwipe, swipeLocked]);

  const stack = challenges.slice(0, STACK_DEPTH);
  const panTargetPinId = swipeAnimatingPinId.current ?? stack[0]?.pinId ?? null;
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
    const tracksPan = challenge.pinId === panTargetPinId;
    const stackScale = 1 - stackIndex * 0.05;
    const stackOffsetY = stackIndex * 12;
    const staticTransform = [
      { scale: stackScale },
      { translateY: stackOffsetY },
      { rotate: `${stackIndex * 1.5}deg` },
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
    panTargetPinId,
    panResponder.panHandlers,
    selectOpacity,
    skipOpacity,
    styles,
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
