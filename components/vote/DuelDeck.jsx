import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { usePalette } from '@/hooks/usePalette';
import { textStyles } from '@/theme/typography';

const VOTE_SWIPE_THRESHOLD = 140;
const MIN_THRESHOLD_PX = 56;
const DIVIDER_CLAMP_PADDING = 2;
const DRAG_RESPONSE_MULTIPLIER = 1.3;
const COMMIT_EXPAND_DURATION_MS = 100;
const COMMIT_HOLD_DURATION_MS = 350;
const PHOTO_SIDE_CROP_PX = 20;
const PHOTO_ASPECT_RATIO = 3 / 4;
const IS_DEV_LOG = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

function clamp(value, min, max) {
  'worklet';
  return Math.max(min, Math.min(max, value));
}

export default function DuelDeck({
  pair,
  onVote,
  disabled = false,
  renderId,
  voteToken,
  deckStyle,
  renderMeta,
  cardStyle,
  imageStyle,
  overlayStyle,
}) {
  const incomingPhotos = useMemo(() => (Array.isArray(pair) ? pair.slice(0, 2) : []), [pair]);
  const { width: windowWidth } = useWindowDimensions();
  const [photos, setPhotos] = useState(() => incomingPhotos);
  const [deckBounds, setDeckBounds] = useState(() => ({ width: Math.max(1, windowWidth), height: 0 }));
  const pendingPhotosRef = useRef(null);
  const voteLockedRef = useRef(false);

  const dividerX = useSharedValue(0);
  const dismissProgress = useSharedValue(0);
  const winnerIndex = useSharedValue(-1);
  const isDismissing = useSharedValue(false);
  const deckWidth = useSharedValue(Math.max(1, windowWidth));

  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const photoStageSize = useMemo(() => {
    const fallbackWidth = Math.max(1, windowWidth);
    const availableWidth = Number.isFinite(deckBounds.width) && deckBounds.width > 0
      ? deckBounds.width
      : fallbackWidth;
    const availableHeight = Number.isFinite(deckBounds.height) && deckBounds.height > 0
      ? deckBounds.height
      : availableWidth / PHOTO_ASPECT_RATIO;

    let width = availableWidth;
    let height = width / PHOTO_ASPECT_RATIO;
    if (height > availableHeight) {
      height = availableHeight;
      width = height * PHOTO_ASPECT_RATIO;
    }

    return {
      width: Math.max(1, width),
      height: Math.max(1, height),
    };
  }, [deckBounds.height, deckBounds.width, windowWidth]);

  useEffect(() => {
    deckWidth.value = photoStageSize.width;
  }, [photoStageSize.width, deckWidth]);

  useEffect(() => {
    if (IS_DEV_LOG) {
      console.log('[dueldeck] mount', { renderId, voteTokenPrefix: typeof voteToken === 'string' ? voteToken.slice(0, 8) : 'none' });
    }
    return () => {
      if (IS_DEV_LOG) {
        console.log('[dueldeck] unmount', { renderId, voteTokenPrefix: typeof voteToken === 'string' ? voteToken.slice(0, 8) : 'none' });
      }
    };
  }, []);

  useEffect(() => {
    if (isDismissing.value) {
      pendingPhotosRef.current = incomingPhotos;
      return;
    }
    setPhotos(incomingPhotos);
  }, [incomingPhotos, isDismissing]);

  const resetDeckState = useCallback(() => {
    dividerX.value = 0;
    dismissProgress.value = 0;
    winnerIndex.value = -1;
    isDismissing.value = false;
    voteLockedRef.current = false;
  }, [dismissProgress, dividerX, isDismissing, winnerIndex]);

  useEffect(() => {
    resetDeckState();
  }, [photos, resetDeckState]);

  const finalizeDismiss = useCallback(() => {
    const pending = pendingPhotosRef.current;
    if (pending) {
      pendingPhotosRef.current = null;
      setPhotos(pending);
    } else {
      setPhotos(incomingPhotos);
    }
    resetDeckState();
  }, [incomingPhotos, resetDeckState]);

  const submitVote = useCallback(
    (targetIndex) => {
      if (disabled || voteLockedRef.current) return;
      if (photos.length < 2) return;
      voteLockedRef.current = true;
      const pairSnapshot = photos.slice(0, 2);
      if (typeof onVote === 'function') {
        onVote(targetIndex, pairSnapshot);
      }
    },
    [disabled, onVote, photos]
  );

  const handleDeckLayout = useCallback(
    (event) => {
      const width = event?.nativeEvent?.layout?.width;
      const height = event?.nativeEvent?.layout?.height;
      setDeckBounds((current) => {
        const nextWidth = Number.isFinite(width) && width > 0 ? width : current.width;
        const nextHeight = Number.isFinite(height) && height > 0 ? height : current.height;
        if (Math.abs(current.width - nextWidth) < 0.5 && Math.abs(current.height - nextHeight) < 0.5) {
          return current;
        }
        return { width: nextWidth, height: nextHeight };
      });
    },
    [setDeckBounds]
  );

  const panGesture = Gesture.Pan()
    .enabled(photos.length >= 2 && !disabled)
    .onUpdate((event) => {
      if (isDismissing.value) return;
      const width = Math.max(deckWidth.value, 1);
      const maxOffset = Math.max(0, width / 2 - DIVIDER_CLAMP_PADDING);
      const boostedTranslation = event.translationX * DRAG_RESPONSE_MULTIPLIER;
      dividerX.value = clamp(boostedTranslation, -maxOffset, maxOffset);
    })
    .onEnd(() => {
      if (isDismissing.value) return;
      const width = Math.max(deckWidth.value, 1);
      const threshold = Math.min(VOTE_SWIPE_THRESHOLD, Math.max(MIN_THRESHOLD_PX, width * 0.33));
      const absX = Math.abs(dividerX.value);
      if (absX < threshold) {
        dividerX.value = withSpring(0, { damping: 19, stiffness: 190 });
        return;
      }

      const targetIndex = dividerX.value >= 0 ? 0 : 1;
      const targetX = targetIndex === 0 ? width / 2 : -width / 2;
      isDismissing.value = true;
      winnerIndex.value = targetIndex;
      dismissProgress.value = 0;
      dividerX.value = withTiming(targetX, { duration: COMMIT_EXPAND_DURATION_MS });
      dismissProgress.value = withTiming(1, { duration: COMMIT_HOLD_DURATION_MS }, (finished) => {
        if (finished) {
          runOnJS(finalizeDismiss)();
        }
      });
      runOnJS(submitVote)(targetIndex);
    });

  const fullFrameStyle = useAnimatedStyle(() => ({
    width: Math.max(deckWidth.value, 1),
  }));

  const leftPaneStyle = useAnimatedStyle(() => {
    const width = Math.max(deckWidth.value, 1);
    const leftWidth = clamp(width * 0.5 + dividerX.value, 0, width);
    return { width: leftWidth };
  });

  const rightPaneStyle = useAnimatedStyle(() => {
    const width = Math.max(deckWidth.value, 1);
    const leftWidth = clamp(width * 0.5 + dividerX.value, 0, width);
    return { width: width - leftWidth };
  });

  const dividerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dividerX.value }],
    opacity: isDismissing.value ? 0 : 1,
  }));

  const handleBubbleStyle = useAnimatedStyle(() => {
    const width = Math.max(deckWidth.value, 1);
    const threshold = Math.min(VOTE_SWIPE_THRESHOLD, Math.max(MIN_THRESHOLD_PX, width * 0.33));
    const absX = Math.abs(dividerX.value);
    const active = absX >= threshold;
    return {
      transform: [{ scale: 1 + Math.min(absX / 420, 0.22) }],
      backgroundColor: active ? colors.primary : colors.bg,
      borderColor: active ? colors.primary : colors.surface,
    };
  });

  const hintStyle = useAnimatedStyle(() => {
    const opacity = !isDismissing.value && Math.abs(dividerX.value) < 20 ? 1 : 0;
    return { opacity };
  });

  const leftMetaStyle = useAnimatedStyle(() => ({ opacity: 1 }));

  const rightMetaStyle = useAnimatedStyle(() => ({ opacity: 1 }));

  const leftWinnerStyle = useAnimatedStyle(() => ({
    opacity: winnerIndex.value === 0 ? dismissProgress.value : 0,
  }));

  const rightWinnerStyle = useAnimatedStyle(() => ({
    opacity: winnerIndex.value === 1 ? dismissProgress.value : 0,
  }));

  if (photos.length < 2) {
    return null;
  }

  return (
    <GestureDetector gesture={panGesture}>
      <View style={[styles.deckArea, deckStyle]} onLayout={handleDeckLayout}>
        <View style={[styles.photoStage, photoStageSize]}>
          <Animated.View style={[styles.pane, styles.leftPane, leftPaneStyle]}>
            <Animated.View style={[styles.fullFrame, styles.leftFrame, fullFrameStyle, cardStyle]}>
              <View style={styles.photoViewport}>
                <View style={styles.photoCropFrame}>
                  <Image
                    source={{ uri: photos[0]?.file_url }}
                    style={[styles.photo, imageStyle]}
                    contentFit="contain"
                    contentPosition="center"
                    cachePolicy="memory-disk"
                  />
                </View>
              </View>
              <View style={[StyleSheet.absoluteFill, styles.photoShade, overlayStyle]} pointerEvents="none" />
              <Animated.View style={[styles.metaSlot, leftMetaStyle]} pointerEvents="box-none">
                {typeof renderMeta === 'function' ? renderMeta(photos[0], 0) : null}
              </Animated.View>
              <Animated.View style={[styles.winnerOverlay, leftWinnerStyle]} pointerEvents="none">
                <View style={styles.winnerBadge}>
                  <Text style={styles.winnerCheck}>✓</Text>
                </View>
                <Text style={styles.winnerText}>WINNER!</Text>
              </Animated.View>
            </Animated.View>
          </Animated.View>

          <Animated.View style={[styles.pane, styles.rightPane, rightPaneStyle]}>
            <Animated.View style={[styles.fullFrame, styles.rightFrame, fullFrameStyle, cardStyle]}>
              <View style={styles.photoViewport}>
                <View style={styles.photoCropFrame}>
                  <Image
                    source={{ uri: photos[1]?.file_url }}
                    style={[styles.photo, imageStyle]}
                    contentFit="contain"
                    contentPosition="center"
                    cachePolicy="memory-disk"
                  />
                </View>
              </View>
              <View style={[StyleSheet.absoluteFill, styles.photoShade, overlayStyle]} pointerEvents="none" />
              <Animated.View style={[styles.metaSlot, rightMetaStyle]} pointerEvents="box-none">
                {typeof renderMeta === 'function' ? renderMeta(photos[1], 1) : null}
              </Animated.View>
              <Animated.View style={[styles.winnerOverlay, rightWinnerStyle]} pointerEvents="none">
                <View style={styles.winnerBadge}>
                  <Text style={styles.winnerCheck}>✓</Text>
                </View>
                <Text style={styles.winnerText}>WINNER!</Text>
              </Animated.View>
            </Animated.View>
          </Animated.View>

          <Animated.View style={[styles.dividerRail, dividerStyle]} pointerEvents="none">
            <Animated.View style={[styles.handleBubble, handleBubbleStyle]}>
              <Text style={styles.handleGlyph}>VS</Text>
            </Animated.View>
            <Animated.View style={[styles.hintRow, hintStyle]}>
              <Text style={styles.hintArrow}>‹</Text>
              <Text style={styles.hintArrow}>›</Text>
            </Animated.View>
          </Animated.View>
        </View>
      </View>
    </GestureDetector>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    deckArea: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      width: '100%',
      overflow: 'hidden',
      backgroundColor: colors.surface,
    },
    photoStage: {
      position: 'relative',
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor: colors.surface,
    },
    pane: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      overflow: 'hidden',
    },
    leftPane: { left: 0 },
    rightPane: { right: 0 },
    fullFrame: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      backgroundColor: colors.surface,
    },
    leftFrame: { left: 0 },
    rightFrame: { right: 0 },
    photoViewport: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    photoCropFrame: {
      ...StyleSheet.absoluteFillObject,
      // Increase this value to intentionally crop more from the left/right sides.
      left: -PHOTO_SIDE_CROP_PX,
      right: -PHOTO_SIDE_CROP_PX,
      overflow: 'hidden',
    },
    photo: {
      width: '100%',
      height: '100%',
    },
    photoShade: {
      backgroundColor: 'rgba(0, 0, 0, 0.24)',
    },
    metaSlot: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 12,
    },
    winnerOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(255, 107, 53, 0.36)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    winnerBadge: {
      width: 92,
      height: 92,
      borderRadius: 46,
      backgroundColor: '#FFFFFF',
      borderWidth: 4,
      borderColor: 'rgba(255, 255, 255, 0.9)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    winnerCheck: {
      ...textStyles.displayLarge,
      color: colors.primary_darkened || colors.primary,
      marginTop: -2,
    },
    winnerText: {
      marginTop: 14,
      ...textStyles.display,
      color: '#FFFFFF',
    },
    dividerRail: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: 2,
      backgroundColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 30,
    },
    handleBubble: {
      width: 64,
      height: 64,
      borderRadius: 32,
      borderWidth: 4,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.text,
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 16,
      shadowOpacity: 0.25,
      elevation: 12,
      zIndex: 2,
    },
    handleGlyph: {
      ...textStyles.titleStrong,
      color: colors.text,
      letterSpacing: 0.8,
    },
    hintRow: {
      position: 'absolute',
      width: 126,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      zIndex: 1,
    },
    hintArrow: {
      ...textStyles.pageTitle,
      color: "#ffffff",
      lineHeight: 29,
    },
  });
}
