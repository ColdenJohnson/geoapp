import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { usePalette } from '@/hooks/usePalette';

const FOCUS_SWIPE_THRESHOLD = 24;
const VOTE_SWIPE_THRESHOLD = 140;
const SWIPE_VISUAL_MULTIPLIER = 1.5;

export default function DuelDeck({
  pair,
  onVote,
  disabled = false,
  deckStyle,
  cardStyle,
  imageStyle,
  overlayStyle,
  renderMeta,
  cardAspectRatio = 3 / 4,
}) {
  const photos = useMemo(() => (Array.isArray(pair) ? pair.slice(0, 2) : []), [pair]);
  const [animating, setAnimating] = useState(false);

  const selectedIndex = useSharedValue(0);
  const translateX = useSharedValue(0);
  const dismissProgress = useSharedValue(0);
  const winnerIndex = useSharedValue(-1);
  const animatingVote = useSharedValue(false);
  const skipSpringReset = useSharedValue(false);

  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    const hasPair = photos.length >= 2;
    const nextIdx = hasPair ? (Math.random() < 0.5 ? 0 : 1) : 0;
    selectedIndex.value = nextIdx;
    translateX.value = 0;
    dismissProgress.value = 0;
    winnerIndex.value = -1;
    animatingVote.value = false;
    skipSpringReset.value = false;
    setAnimating(false);
  }, [photos, selectedIndex, translateX, dismissProgress, winnerIndex, animatingVote, skipSpringReset]);

  const handleVote = useCallback(
    (idx) => {
      if (disabled || animating) return;
      const target = typeof idx === 'number' ? idx : selectedIndex.value;
      const pairSnapshot = photos.slice(0, 2);
      animatingVote.value = true;
      setAnimating(true);
      winnerIndex.value = target;
      dismissProgress.value = 0;
      dismissProgress.value = withTiming(
        1,
        { duration: 250 },
        (finished) => {
          animatingVote.value = false;
        }
      );
      if (typeof onVote === 'function') {
        const delayMs = 260;
        setTimeout(() => {
          onVote(target, pairSnapshot);
        }, delayMs);
      }
    },
    [disabled, animating, photos, selectedIndex, animatingVote, winnerIndex, dismissProgress, onVote]
  );

  const focusIndex = useDerivedValue(() => {
    if (Math.abs(translateX.value) > FOCUS_SWIPE_THRESHOLD) {
      return translateX.value > 0 ? 0 : 1;
    }
    return selectedIndex.value;
  });

  const swipeProgress = useDerivedValue(() => {
    const distance = Math.abs(translateX.value);
    return Math.min(distance / VOTE_SWIPE_THRESHOLD, 1);
  });

  const panGesture = Gesture.Pan()
    .enabled(photos.length >= 2 && !disabled && !animating)
    .onUpdate((event) => {
      const scaledX = event.translationX * SWIPE_VISUAL_MULTIPLIER;
      translateX.value = scaledX;
    })
    .onEnd((event) => {
      const scaledX = event.translationX * SWIPE_VISUAL_MULTIPLIER;
      const absX = Math.abs(scaledX);
      if (absX >= VOTE_SWIPE_THRESHOLD) {
        const targetIndex = scaledX > 0 ? 0 : 1;
        runOnJS(handleVote)(targetIndex);
      } else if (absX >= FOCUS_SWIPE_THRESHOLD) {
        const targetIndex = scaledX > 0 ? 0 : 1;
        selectedIndex.value = targetIndex;
        skipSpringReset.value = true;
        translateX.value = withTiming(0, { duration: 180 });
      }
    })
    .onFinalize(() => {
      if (animatingVote.value) return;
      if (skipSpringReset.value) {
        skipSpringReset.value = false;
        return;
      }
      translateX.value = withSpring(0);
    });

  if (photos.length < 2) {
    return null;
  }

  return (
    <GestureDetector gesture={panGesture}>
      <View style={[styles.deckArea, deckStyle]}>
        {photos.map((photo, idx) => (
          <AnimatedPhotoCard
            key={photo?._id ?? idx}
            index={idx}
            photo={photo}
            styles={styles}
            translateX={translateX}
            focusIndex={focusIndex}
            swipeProgress={swipeProgress}
            winnerIndex={winnerIndex}
            dismissProgress={dismissProgress}
            cardStyle={cardStyle}
            imageStyle={imageStyle}
            overlayStyle={overlayStyle}
            renderMeta={renderMeta}
            cardAspectRatio={cardAspectRatio}
          />
        ))}
      </View>
    </GestureDetector>
  );
}

function AnimatedPhotoCard({
  photo,
  index,
  translateX,
  focusIndex,
  swipeProgress,
  winnerIndex,
  dismissProgress,
  styles,
  cardStyle,
  imageStyle,
  overlayStyle,
  renderMeta,
  cardAspectRatio,
}) {
  const focus = useDerivedValue(
    () => withTiming(focusIndex.value === index ? 1 : 0, { duration: 180 }),
    [focusIndex, index]
  );

  const animatedStyle = useAnimatedStyle(
    () => {
      const active = focus.value;
      const progress = swipeProgress.value;
      const swipeActive = Math.abs(translateX.value) > 1;
      const targetIndex = swipeActive ? (translateX.value > 0 ? 0 : 1) : focusIndex.value;
      const isTarget = swipeActive && targetIndex === index;
      const baseOffsetX = index === 0 ? -120 : 120;
      const focusNudge = (index === 0 ? -1 : 1) * active * 14;
      const pullToCenter = isTarget ? baseOffsetX * (1 - progress) : baseOffsetX + focusNudge;
      const pushAway = !isTarget && swipeActive ? baseOffsetX + (index === 0 ? -18 : 18) * progress : pullToCenter;
      const translateCardX = isTarget ? pullToCenter : pushAway;
      const lift = winnerIndex.value === index ? -40 * dismissProgress.value : 0;
      const baseScale = 0.82 + active * 0.06;
      const scale = isTarget ? baseScale + 0.22 * progress : baseScale - 0.04 * progress;
      const winnerBoost = winnerIndex.value === index ? 0.05 * dismissProgress.value : 0;
      const fadeOut = winnerIndex.value === -1 ? 1 : winnerIndex.value === index ? 1 : 1 - dismissProgress.value;

      return {
        zIndex: isTarget ? 3 : focusIndex.value === index ? 2 : 1,
        shadowOpacity: 0.16 + 0.3 * active + (isTarget ? 0.2 * progress : 0),
        transform: [
          { translateX: translateCardX },
          { translateY: lift },
          { scale: scale + winnerBoost },
        ],
        opacity: fadeOut,
      };
    },
    [index]
  );

  return (
    <Animated.View style={[styles.card, { aspectRatio: cardAspectRatio }, cardStyle, animatedStyle]}>
      <Image
        source={{ uri: photo?.file_url }}
        style={[styles.photo, imageStyle]}
        resizeMode="cover"
        cachePolicy="memory-disk"
      />
      {typeof renderMeta === 'function' ? renderMeta(photo, index) : null}
      <View style={[StyleSheet.absoluteFill, styles.cardOverlay, overlayStyle]} pointerEvents="none" />
    </Animated.View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    deckArea: {
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      width: '100%',
      maxWidth: 720,
    },
    card: {
      position: 'absolute',
      width: '100%',
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: colors.bg,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 12 },
      shadowRadius: 24,
      elevation: 12,
    },
    photo: { ...StyleSheet.absoluteFillObject },
    cardOverlay: { backgroundColor: 'rgba(0,0,0,0.05)' },
  });
}
