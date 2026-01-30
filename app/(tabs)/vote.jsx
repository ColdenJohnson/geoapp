import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
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

import { voteGlobalDuel } from '@/lib/api';
import { usePalette } from '@/hooks/usePalette';
import {
  advanceGlobalDuelQueue,
  DEFAULT_PRELOAD_COUNT,
  ensurePreloadedGlobalDuels,
  getCurrentGlobalDuelPair,
  getOrLoadGlobalDuelPair,
} from '@/lib/globalDuelQueue';

const FOCUS_SWIPE_THRESHOLD = 24;
const VOTE_SWIPE_THRESHOLD = 140;
const PRELOADED_PAIR_COUNT = DEFAULT_PRELOAD_COUNT;

export default function GlobalVoteScreen() {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [animating, setAnimating] = useState(false);
  const isActiveRef = useRef(false);

  const selectedIndex = useSharedValue(0);
  const translateX = useSharedValue(0);
  const dismissProgress = useSharedValue(0);
  const winnerIndex = useSharedValue(-1);
  const animatingVote = useSharedValue(false);

  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const syncFromQueue = useCallback(async () => {
    const head = getCurrentGlobalDuelPair();
    if (Array.isArray(head) && head.length >= 2) {
      setPhotos(head);
      setLoading(false);
      ensurePreloadedGlobalDuels(PRELOADED_PAIR_COUNT).catch((error) =>
        console.error('Failed to keep preloading queue', error)
      );
      return;
    }

    setLoading(true);
    const next = await getOrLoadGlobalDuelPair(PRELOADED_PAIR_COUNT);
    if (!isActiveRef.current) return;
    setPhotos(Array.isArray(next) ? next : []);
    setLoading(Array.isArray(next) && next.length >= 2 ? false : true);
  }, [setLoading, setPhotos, ensurePreloadedGlobalDuels, getCurrentGlobalDuelPair, getOrLoadGlobalDuelPair]);

  const advanceQueue = useCallback(() => {
    const nextPair = advanceGlobalDuelQueue(PRELOADED_PAIR_COUNT);
    setPhotos(Array.isArray(nextPair) ? nextPair : []);
    if (!Array.isArray(nextPair) || nextPair.length < 2) {
      setLoading(true);
      getOrLoadGlobalDuelPair(PRELOADED_PAIR_COUNT).then((pair) => {
        if (!isActiveRef.current) return;
        if (Array.isArray(pair) && pair.length >= 2) {
          setPhotos(pair);
          setLoading(false);
        }
      });
    } else {
      setLoading(false);
    }
  }, [advanceGlobalDuelQueue, getOrLoadGlobalDuelPair, setLoading, setPhotos]);

  useFocusEffect(
    useCallback(() => {
      isActiveRef.current = true;
      syncFromQueue();
      return () => {
        isActiveRef.current = false;
      };
    }, [syncFromQueue])
  );

  const setActiveCard = useCallback(
    (index) => {
      const next = Math.max(0, Math.min(index, 1));
      selectedIndex.value = next;
    },
    [selectedIndex]
  );

  useEffect(() => {
    const hasPair = Array.isArray(photos) && photos.length >= 2;
    const nextIdx = hasPair ? (Math.random() < 0.5 ? 0 : 1) : 0;
    setActiveCard(nextIdx);
    selectedIndex.value = nextIdx;
    translateX.value = 0;
    dismissProgress.value = 0;
    winnerIndex.value = -1;
    animatingVote.value = false;
    setAnimating(false);
  }, [photos, setActiveCard, selectedIndex, translateX, dismissProgress, winnerIndex, animatingVote]);

  const choose = useCallback(
    async (winnerId, loserId, { advanceImmediately = false } = {}) => {
      if (!winnerId || !loserId || submitting) return;
      if (isActiveRef.current) {
        setSubmitting(true);
      }
      if (advanceImmediately) {
        advanceQueue();
      }
      try {
        const result = await voteGlobalDuel({ winnerPhotoId: winnerId, loserPhotoId: loserId });
        if (result?.success && !advanceImmediately) {
          advanceQueue();
        }
      } catch (error) {
        console.error('Failed to submit global vote', error);
      } finally {
        if (isActiveRef.current) {
          setSubmitting(false);
        }
      }
    },
    [advanceQueue, submitting]
  );

  const chooseByIndex = useCallback(
    (winnerIndex, pairOverride) => {
      const pair = Array.isArray(pairOverride) ? pairOverride : photos;
      if (!Array.isArray(pair) || pair.length < 2) return;
      const winner = pair[winnerIndex];
      const loser = pair[winnerIndex === 0 ? 1 : 0];
      if (!winner?._id || !loser?._id) return;
      choose(winner._id, loser._id, { advanceImmediately: true });
    },
    [choose, photos]
  );

  const handleVote = useCallback(
    (idx) => {
      if (loading || submitting || animating) return;
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
          if (finished) {
            runOnJS(chooseByIndex)(target, pairSnapshot);
          }
          animatingVote.value = false;
        }
      );
    },
    [animating, animatingVote, chooseByIndex, dismissProgress, loading, photos, selectedIndex, submitting, winnerIndex]
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
    .enabled(photos.length >= 2 && !loading && !submitting && !animating)
    .onUpdate((event) => {
      translateX.value = event.translationX;
    })
    .onEnd((event) => {
      const { translationX } = event;
      const absX = Math.abs(translationX);
      if (absX >= VOTE_SWIPE_THRESHOLD) {
        const targetIndex = translationX > 0 ? 0 : 1;
        runOnJS(handleVote)(targetIndex);
      } else if (absX >= FOCUS_SWIPE_THRESHOLD) {
        const targetIndex = translationX > 0 ? 0 : 1;
        runOnJS(setActiveCard)(targetIndex);
      }
    })
    .onFinalize(() => {
      if (animatingVote.value) return;
      translateX.value = withSpring(0);
    });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Vote for the best photo</Text>
        </View>

        <View style={styles.body}>
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.helperText}>Loading a new duel…</Text>
            </View>
          ) : photos.length < 2 ? (
            <View style={styles.centered}>
              <Text style={styles.emptyText}>Need at least two photos to start global voting.</Text>
            </View>
          ) : (
            <>
              <GestureDetector gesture={panGesture}>
                <View style={styles.deckArea}>
                  {photos.slice(0, 2).map((photo, idx) => (
                    <AnimatedPhotoCard
                      key={photo._id ?? idx}
                      index={idx}
                      photo={photo}
                      styles={styles}
                      translateX={translateX}
                      focusIndex={focusIndex}
                      swipeProgress={swipeProgress}
                      winnerIndex={winnerIndex}
                      dismissProgress={dismissProgress}
                    />
                  ))}
                </View>
              </GestureDetector>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
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
    <Animated.View style={[styles.card, animatedStyle]}>
      <Image source={{ uri: photo?.file_url }} style={styles.photo} resizeMode="cover" cachePolicy="memory-disk" />
      <View style={styles.meta}>
        <Text style={styles.metaTitle}>Global Elo {Number.isFinite(photo?.global_elo) ? photo.global_elo : 1000}</Text>
        <Text style={styles.metaDetail}>
          W {photo?.global_wins ?? 0} · L {photo?.global_losses ?? 0}
        </Text>
      </View>
      <View style={[StyleSheet.absoluteFill, styles.cardOverlay]} pointerEvents="none" />
    </Animated.View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    container: { flex: 1, paddingHorizontal: 16, paddingTop: 12, gap: 16, backgroundColor: colors.surface },
    header: { gap: 4 },
    title: { fontSize: 24, fontWeight: '700', color: colors.text },
    body: { flex: 1, gap: 16 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    emptyText: { color: colors.textMuted, fontSize: 16, textAlign: 'center', paddingHorizontal: 12 },
    deckArea: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      width: '100%',
      maxWidth: 720,
    },
    card: {
      position: 'absolute',
      width: '100%',
      aspectRatio: 3 / 4,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: colors.bg,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 12 },
      shadowRadius: 24,
      elevation: 12,
    },
    photo: { ...StyleSheet.absoluteFillObject },
    meta: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 14,
      backgroundColor: 'rgba(0,0,0,0.35)',
      gap: 4,
    },
    metaTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
    metaDetail: { fontSize: 14, color: '#F3F4F6' },
    helperText: { color: colors.textMuted, textAlign: 'center', fontSize: 14 },
    cardOverlay: { backgroundColor: 'rgba(0,0,0,0.05)' },
  });
}
