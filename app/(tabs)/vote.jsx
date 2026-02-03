import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { voteGlobalDuel } from '@/lib/api';
import { usePalette } from '@/hooks/usePalette';
import DuelDeck from '@/components/vote/DuelDeck';
import {
  advanceGlobalDuelQueue,
  DEFAULT_PRELOAD_COUNT,
  ensurePreloadedGlobalDuels,
  getCurrentGlobalDuelPair,
  getOrLoadGlobalDuelPair,
} from '@/lib/globalDuelQueue';

const PRELOADED_PAIR_COUNT = DEFAULT_PRELOAD_COUNT;

export default function GlobalVoteScreen() {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [logs, setLogs] = useState([]);
  const isActiveRef = useRef(false);

  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const addLog = useCallback((message, data) => {
    const stamp = new Date().toISOString();
    const detail = data ? ` ${JSON.stringify(data)}` : '';
    setLogs((prev) => {
      const next = [...prev, `${stamp} ${message}${detail}`];
      return next.length > 80 ? next.slice(-80) : next;
    });
  }, []);

  const syncFromQueue = useCallback(async () => {
    addLog('syncFromQueue:start');
    const head = getCurrentGlobalDuelPair();
    if (Array.isArray(head) && head.length >= 2) {
      addLog('syncFromQueue:cache-hit', { length: head.length });
      setPhotos(head);
      setLoading(false);
      ensurePreloadedGlobalDuels(PRELOADED_PAIR_COUNT).catch((error) =>
        addLog('preload:error', { message: error?.message })
      );
      return;
    }

    setLoading(true);
    let next = [];
    try {
      next = await getOrLoadGlobalDuelPair(PRELOADED_PAIR_COUNT);
    } catch (error) {
      addLog('syncFromQueue:error', { message: error?.message });
    }
    if (!isActiveRef.current) return;
    setPhotos(Array.isArray(next) ? next : []);
    addLog('syncFromQueue:loaded', { length: Array.isArray(next) ? next.length : 0 });
    setLoading(Array.isArray(next) && next.length >= 2 ? false : true);
  }, [
    addLog,
    setLoading,
    setPhotos,
    ensurePreloadedGlobalDuels,
    getCurrentGlobalDuelPair,
    getOrLoadGlobalDuelPair,
  ]);

  const advanceQueue = useCallback(() => {
    const nextPair = advanceGlobalDuelQueue(PRELOADED_PAIR_COUNT);
    addLog('advanceQueue:next', { length: Array.isArray(nextPair) ? nextPair.length : 0 });
    setPhotos(Array.isArray(nextPair) ? nextPair : []);
    if (!Array.isArray(nextPair) || nextPair.length < 2) {
      setLoading(true);
      getOrLoadGlobalDuelPair(PRELOADED_PAIR_COUNT).then((pair) => {
        if (!isActiveRef.current) return;
        if (Array.isArray(pair) && pair.length >= 2) {
          setPhotos(pair);
          setLoading(false);
        }
        addLog('advanceQueue:loaded', { length: Array.isArray(pair) ? pair.length : 0 });
      });
    } else {
      setLoading(false);
    }
  }, [addLog, advanceGlobalDuelQueue, getOrLoadGlobalDuelPair, setLoading, setPhotos]);

  useFocusEffect(
    useCallback(() => {
      isActiveRef.current = true;
      addLog('focus:enter');
      syncFromQueue();
      return () => {
        isActiveRef.current = false;
        addLog('focus:exit');
      };
    }, [addLog, syncFromQueue])
  );

  const choose = useCallback(
    async (winnerId, loserId, { advanceImmediately = false } = {}) => {
      if (!winnerId || !loserId || submitting) return;
      addLog('choose:start', { advanceImmediately, winnerId, loserId });
      if (isActiveRef.current) {
        setSubmitting(true);
      }
      if (advanceImmediately) {
        advanceQueue();
      }
      try {
        const result = await voteGlobalDuel({ winnerPhotoId: winnerId, loserPhotoId: loserId });
        addLog('choose:result', { success: result?.success });
        if (result?.success && !advanceImmediately) {
          advanceQueue();
        }
      } catch (error) {
        addLog('choose:error', { message: error?.message });
      } finally {
        if (isActiveRef.current) {
          setSubmitting(false);
        }
      }
    },
    [addLog, advanceQueue, submitting]
  );

  const chooseByIndex = useCallback(
    (winnerIndex, pairOverride) => {
      const pair = Array.isArray(pairOverride) ? pairOverride : photos;
      if (!Array.isArray(pair) || pair.length < 2) {
        addLog('chooseByIndex:invalid-pair', { length: Array.isArray(pair) ? pair.length : 0 });
        return;
      }
      const winner = pair[winnerIndex];
      const loser = pair[winnerIndex === 0 ? 1 : 0];
      if (!winner?._id || !loser?._id) {
        addLog('chooseByIndex:missing-ids', { winnerId: winner?._id, loserId: loser?._id });
        return;
      }
      addLog('chooseByIndex:vote', { winnerIndex });
      choose(winner._id, loser._id, { advanceImmediately: true });
    },
    [addLog, choose, photos]
  );

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
            <DuelDeck
              pair={photos}
              disabled={loading || submitting}
              onVote={chooseByIndex}
              deckStyle={styles.deckArea}
              renderMeta={(photo) => (
                <View style={styles.meta}>
                  <Text style={styles.metaTitle}>
                    Global Elo {Number.isFinite(photo?.global_elo) ? photo.global_elo : 1000}
                  </Text>
                  <Text style={styles.metaDetail}>
                    W {photo?.global_wins ?? 0} · L {photo?.global_losses ?? 0}
                  </Text>
                </View>
              )}
            />
          )}
        </View>

        <View style={styles.logPanel} pointerEvents="none">
          <Text style={styles.logTitle}>VOTE DEBUG LOGS</Text>
          <ScrollView style={styles.logScroll}>
            {logs.map((line, index) => (
              <Text key={`${line}-${index}`} style={styles.logLine}>
                {line}
              </Text>
            ))}
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
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
    logPanel: {
      position: 'absolute',
      left: 12,
      right: 12,
      bottom: 84,
      maxHeight: 220,
      padding: 10,
      backgroundColor: 'rgba(0,0,0,0.78)',
      borderRadius: 10,
    },
    logTitle: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', marginBottom: 6 },
    logScroll: { maxHeight: 170 },
    logLine: { color: '#D1FAE5', fontSize: 11, marginBottom: 4 },
  });
}
