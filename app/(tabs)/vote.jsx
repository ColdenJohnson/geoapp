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

const SWIPE_HORIZONTAL_THRESHOLD = 60;
const SWIPE_VERTICAL_THRESHOLD = 90;
const PRELOADED_PAIR_COUNT = DEFAULT_PRELOAD_COUNT;

export default function GlobalVoteScreen() {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [selectedCard, setSelectedCard] = useState(0);
  const isActiveRef = useRef(false);

  const selectedIndex = useSharedValue(0);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
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

  const bannerStyle = useAnimatedStyle(
    () => {
      const pullUp = Math.max(0, -translateY.value);
      const progress = Math.min(1, pullUp / 300);
      return { opacity: withTiming(progress, { duration: 120 }) };
    },
    [translateY]
  );

  const setActiveCard = useCallback(
    (index) => {
      const next = Math.max(0, Math.min(index, 1));
      setSelectedCard(next);
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
    translateY.value = 0;
    dismissProgress.value = 0;
    winnerIndex.value = -1;
    animatingVote.value = false;
    setAnimating(false);
  }, [photos, setActiveCard, selectedIndex, translateX, translateY, dismissProgress, winnerIndex, animatingVote]);

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

  const handleHorizontalSwitch = useCallback(
    (direction) => {
      if (!Array.isArray(photos) || photos.length < 2) return;
      if (direction === 'left') {
        setActiveCard(0);
      } else if (direction === 'right') {
        setActiveCard(1);
      }
    },
    [photos, setActiveCard]
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
        { duration: 450 },
        (finished) => {
          if (finished) {
            runOnJS(chooseByIndex)(target, pairSnapshot);
          }
          animatingVote.value = false;
          winnerIndex.value = -1;
          dismissProgress.value = 0;
          runOnJS(setAnimating)(false);
        }
      );
    },
    [animating, animatingVote, chooseByIndex, dismissProgress, loading, photos, selectedIndex, submitting, winnerIndex]
  );

  const panGesture = Gesture.Pan()
    .enabled(photos.length >= 2 && !loading && !submitting && !animating)
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      const { translationX, translationY } = event;
      const absX = Math.abs(translationX);
      const absY = Math.abs(translationY);

      if (translationY < -SWIPE_VERTICAL_THRESHOLD && absY > absX) {
        runOnJS(handleVote)(selectedIndex.value);
      } else if (translationX > SWIPE_HORIZONTAL_THRESHOLD) {
        runOnJS(handleHorizontalSwitch)('left');
      } else if (translationX < -SWIPE_HORIZONTAL_THRESHOLD) {
        runOnJS(handleHorizontalSwitch)('right');
      }
    })
    .onFinalize(() => {
      if (animatingVote.value) return;
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    });

  const selectedPhoto = photos[selectedCard];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Global Vote</Text>
          <Text style={styles.subtitle}>Swipe through the pair, then fling up to crown the winner.</Text>
        </View>

        <View pointerEvents="none" style={styles.bannerContainer}>
          <Animated.View style={[styles.banner, bannerStyle]}>
            <Text style={styles.bannerText}>👑 WINNER SELECTED 👑</Text>
          </Animated.View>
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
                      selectedIndex={selectedIndex}
                      translateX={translateX}
                      translateY={translateY}
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

function AnimatedPhotoCard({ photo, index, selectedIndex, translateX, translateY, winnerIndex, dismissProgress, styles }) {
  const focus = useDerivedValue(
    () => withTiming(selectedIndex.value === index ? 1 : 0, { duration: 220 }),
    [selectedIndex, index]
  );

  const animatedStyle = useAnimatedStyle(
    () => {
      const active = focus.value;
      const isActive = selectedIndex.value === index;
      const activeOffsetX = index === 0 ? -16 : 16; // keep selected card slightly off center
      const restingOffsetX = index === 0 ? -50 : 50;
      const translateCardX =
        (isActive ? translateX.value * 0.45 : 0) + activeOffsetX * active + restingOffsetX * (1 - active);
      const baseTranslateY = (isActive ? translateY.value * 0.55 : 0) + (1 - active) * 18;
      const flyUp = winnerIndex.value === index ? -900 * dismissProgress.value : 0;
      const translateCardY = baseTranslateY + flyUp;
      const baseScale = 0.77 + active * 0.15;
      const scale = winnerIndex.value === index ? baseScale + 0.05 * dismissProgress.value : baseScale;
      const fadeOut = winnerIndex.value === -1 ? 1 : winnerIndex.value === index ? 1 : 1 - dismissProgress.value;

      return {
        zIndex: isActive ? 2 : 1,
        shadowOpacity: 0.18 + 0.25 * active,
        transform: [
          { translateX: translateCardX },
          { translateY: translateCardY },
          { scale },
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
    subtitle: { fontSize: 15, color: colors.textMuted },
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
    bannerContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '10%',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 5,
    },
    banner: {
      width: '100%',
      height: '100%',
      paddingHorizontal: 12,
      backgroundColor: 'rgba(255, 215, 0, 0.92)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: '#B8860B',
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      justifyContent: 'center',
    },
    bannerText: {
      color: '#3B2F05',
      fontWeight: '900',
      letterSpacing: 0.2,
      textAlign: 'center',
      fontSize: 22,
    },
  });
}
