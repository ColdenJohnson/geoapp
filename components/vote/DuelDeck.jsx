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

const VOTE_SWIPE_THRESHOLD = 140;
const MIN_THRESHOLD_PX = 56;
const DIVIDER_CLAMP_PADDING = 2;
const DRAG_RESPONSE_MULTIPLIER = 1.3;
const COMMIT_EXPAND_DURATION_MS = 100;
const COMMIT_HOLD_DURATION_MS = 350;
const META_REVEAL_DISTANCE = 60;
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
  const [photos, setPhotos] = useState(() => incomingPhotos);
  const pendingPhotosRef = useRef(null);
  const voteLockedRef = useRef(false);
  const { width: windowWidth } = useWindowDimensions();

  const dividerX = useSharedValue(0);
  const dismissProgress = useSharedValue(0);
  const winnerIndex = useSharedValue(-1);
  const isDismissing = useSharedValue(false);
  const deckWidth = useSharedValue(Math.max(1, windowWidth));

  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    if (windowWidth > 0) {
      deckWidth.value = windowWidth;
    }
  }, [windowWidth, deckWidth]);

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
      if (Number.isFinite(width) && width > 0) {
        deckWidth.value = width;
      }
    },
    [deckWidth]
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
      backgroundColor: active ? colors.primary : '#FFFFFF',
    };
  });

  const hintStyle = useAnimatedStyle(() => {
    const opacity = !isDismissing.value && Math.abs(dividerX.value) < 20 ? 1 : 0;
    return { opacity };
  });

  const leftMetaStyle = useAnimatedStyle(() => {
    const dragReveal = clamp(dividerX.value / META_REVEAL_DISTANCE, 0, 1);
    const winnerReveal = winnerIndex.value === 0 ? dismissProgress.value : 0;
    return { opacity: Math.max(dragReveal, winnerReveal) };
  });

  const rightMetaStyle = useAnimatedStyle(() => {
    const dragReveal = clamp((-dividerX.value) / META_REVEAL_DISTANCE, 0, 1);
    const winnerReveal = winnerIndex.value === 1 ? dismissProgress.value : 0;
    return { opacity: Math.max(dragReveal, winnerReveal) };
  });

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
        <Animated.View style={[styles.pane, styles.leftPane, leftPaneStyle]}>
          <Animated.View style={[styles.fullFrame, styles.leftFrame, fullFrameStyle, cardStyle]}>
            <Image
              source={{ uri: photos[0]?.file_url }}
              style={[styles.photo, imageStyle]}
              resizeMode="cover"
              cachePolicy="memory-disk"
            />
            <View style={[StyleSheet.absoluteFill, styles.photoShade, overlayStyle]} pointerEvents="none" />
            <Animated.View style={[styles.metaSlot, leftMetaStyle]} pointerEvents="none">
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
            <Image
              source={{ uri: photos[1]?.file_url }}
              style={[styles.photo, imageStyle]}
              resizeMode="cover"
              cachePolicy="memory-disk"
            />
            <View style={[StyleSheet.absoluteFill, styles.photoShade, overlayStyle]} pointerEvents="none" />
            <Animated.View style={[styles.metaSlot, rightMetaStyle]} pointerEvents="none">
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
      backgroundColor: '#000000',
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
    },
    leftFrame: { left: 0 },
    rightFrame: { right: 0 },
    photo: {
      width: '100%',
      height: '100%',
    },
    photoShade: {
      backgroundColor: 'rgba(0, 0, 0, 0.24)',
    },
    metaSlot: {
      position: 'absolute',
      left: 20,
      right: 20,
      bottom: 34,
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
      fontSize: 44,
      fontWeight: '900',
      color: colors.primary_darkened || colors.primary,
      marginTop: -2,
    },
    winnerText: {
      marginTop: 14,
      fontSize: 34,
      fontWeight: '900',
      color: '#FFFFFF',
      letterSpacing: 0.4,
    },
    dividerRail: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: 2,
      backgroundColor: 'rgba(255, 255, 255, 0.34)',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 30,
    },
    handleBubble: {
      width: 64,
      height: 64,
      borderRadius: 32,
      borderWidth: 4,
      borderColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 16,
      shadowOpacity: 0.25,
      elevation: 12,
      zIndex: 2,
    },
    handleGlyph: {
      fontSize: 18,
      fontWeight: '900',
      color: '#0f172a',
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
      fontSize: 29,
      color: 'rgba(255, 255, 255, 0.82)',
      fontWeight: '800',
      lineHeight: 29,
    },
  });
}
