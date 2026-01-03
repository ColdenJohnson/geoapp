import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { fetchGlobalDuel, voteGlobalDuel } from '@/lib/api';
import { usePalette } from '@/hooks/usePalette';

const SWIPE_HORIZONTAL_THRESHOLD = 60;
const SWIPE_VERTICAL_THRESHOLD = 90;

export default function GlobalVoteScreen() {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCard, setSelectedCard] = useState(0);
  const isActiveRef = useRef(false);
  const selectedRef = useRef(0);

  const selectedIndex = useSharedValue(0);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const loadPair = useCallback(async () => {
    if (!isActiveRef.current) return;
    setLoading(true);
    try {
      const pair = await fetchGlobalDuel();
      if (isActiveRef.current) {
        setPhotos(Array.isArray(pair) ? pair : []);
      }
    } catch (error) {
      console.error('Failed to refresh global duel', error);
      if (isActiveRef.current) {
        setPhotos([]);
      }
    } finally {
      if (isActiveRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      isActiveRef.current = true;
      loadPair();
      return () => {
        isActiveRef.current = false;
      };
    }, [loadPair])
  );

  const setActiveCard = useCallback(
    (index) => {
      const next = Math.max(0, Math.min(index, 1));
      selectedRef.current = next;
      setSelectedCard(next);
      selectedIndex.value = next;
    },
    [selectedIndex]
  );

  useEffect(() => {
    setActiveCard(0);
  }, [photos, setActiveCard]);

  const choose = useCallback(
    async (winnerId, loserId) => {
      if (!winnerId || !loserId || submitting) return;
      if (isActiveRef.current) {
        setSubmitting(true);
      }
      try {
        const result = await voteGlobalDuel({ winnerPhotoId: winnerId, loserPhotoId: loserId });
        if (result?.success) {
          await loadPair();
        }
      } catch (error) {
        console.error('Failed to submit global vote', error);
      } finally {
        if (isActiveRef.current) {
          setSubmitting(false);
        }
      }
    },
    [loadPair, submitting]
  );

  const chooseByIndex = useCallback(
    (winnerIndex) => {
      if (!Array.isArray(photos) || photos.length < 2) return;
      const winner = photos[winnerIndex];
      const loser = photos[winnerIndex === 0 ? 1 : 0];
      if (!winner?._id || !loser?._id) return;
      choose(winner._id, loser._id);
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
      if (loading || submitting) return;
      const target = typeof idx === 'number' ? idx : selectedRef.current;
      chooseByIndex(target);
    },
    [chooseByIndex, loading, submitting]
  );

  const panGesture = Gesture.Pan()
    .enabled(photos.length >= 2 && !loading && !submitting)
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      const { translationX, translationY } = event;
      const absX = Math.abs(translationX);
      const absY = Math.abs(translationY);

      if (translationY < -SWIPE_VERTICAL_THRESHOLD && absY > absX) {
        runOnJS(handleVote)(selectedRef.current);
      } else if (translationX > SWIPE_HORIZONTAL_THRESHOLD) {
        runOnJS(handleHorizontalSwitch)('left');
      } else if (translationX < -SWIPE_HORIZONTAL_THRESHOLD) {
        runOnJS(handleHorizontalSwitch)('right');
      }
    })
    .onFinalize(() => {
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
                    />
                  ))}
                </View>
              </GestureDetector>

              <View style={styles.helperBar}>
                <Text style={styles.helperText}>
                  {submitting
                    ? 'Submitting your vote...'
                    : 'Swipe left/right to preview · Swipe up to pick'}
                </Text>
                {selectedPhoto ? (
                  <Text style={styles.selectionText}>
                    Selected card: Elo {Number.isFinite(selectedPhoto?.global_elo) ? selectedPhoto.global_elo : 1000} · W{' '}
                    {selectedPhoto?.global_wins ?? 0} · L {selectedPhoto?.global_losses ?? 0}
                  </Text>
                ) : null}
              </View>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

function AnimatedPhotoCard({ photo, index, selectedIndex, translateX, translateY, styles }) {
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
        (isActive ? translateX.value * 0.35 : 0) + activeOffsetX * active + restingOffsetX * (1 - active);
      const translateCardY = (isActive ? translateY.value * 0.3 : 0) + (1 - active) * 18;
      const scale = 0.77 + active * 0.15;

      return {
        zIndex: isActive ? 2 : 1,
        shadowOpacity: 0.18 + 0.25 * active,
        transform: [
          { translateX: translateCardX },
          { translateY: translateCardY },
          { scale },
        ],
      };
    },
    [index]
  );

  return (
    <Animated.View style={[styles.card, animatedStyle]}>
      <Image source={{ uri: photo?.file_url }} style={styles.photo} resizeMode="cover" />
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
    helperBar: {
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      gap: 6,
    },
    helperText: { color: colors.textMuted, textAlign: 'center', fontSize: 14 },
    selectionText: { color: colors.text, textAlign: 'center', fontWeight: '600' },
    cardOverlay: { backgroundColor: 'rgba(0,0,0,0.05)' },
  });
}
