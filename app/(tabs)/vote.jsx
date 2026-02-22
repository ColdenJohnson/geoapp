import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';

import { voteGlobalDuel, isTokenFresh } from '@/lib/api';
import { usePalette } from '@/hooks/usePalette';
import DuelDeck from '@/components/vote/DuelDeck';
import {
  advanceGlobalDuelQueue,
  DEFAULT_PRELOAD_COUNT,
  ensurePreloadedGlobalDuels,
  getCurrentGlobalDuelPair,
  getOrLoadFirstGlobalDuelPair,
  ensureFreshTokensForQueue,
  getRemainingGlobalVotes,
  setRemainingGlobalVotes,
  clearGlobalDuelQueue,
} from '@/lib/globalDuelQueue';

const PRELOADED_PAIR_COUNT = DEFAULT_PRELOAD_COUNT;
const VOTE_LIMIT_WINDOW_MINUTES = 60;

const IS_DEV_LOG = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

function tokenPrefix(token) {
  return typeof token === 'string' ? token.slice(0, 8) : 'none';
}

function extractPhotoIds(item) {
  if (!item) return [];
  if (Array.isArray(item.photoIds)) return item.photoIds.slice(0, 2);
  if (Array.isArray(item.photos)) return item.photos.map(p => p?._id).filter(Boolean).slice(0, 2);
  return [];
}

export default function GlobalVoteScreen() {
  const [duel, setDuel] = useState(null);
  const [renderId, setRenderId] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [remainingVotes, setRemainingVotes] = useState(null);
  const isActiveRef = useRef(false);
  const renderCounterRef = useRef(0);
  const isDevEnv = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
  const isScreenFocused = useIsFocused();

  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const photos = useMemo(() => (Array.isArray(duel?.photos) ? duel.photos : []), [duel]);
  const isPinRandom = duel?.bucketType === 'pin_random';
  const duelReady = useCallback(
    (pkg) =>
      Array.isArray(pkg?.photos) &&
      pkg.photos.length >= 2 &&
      typeof pkg?.voteToken === 'string' &&
      pkg.voteToken.length > 0 &&
      isTokenFresh(pkg?.expiresAt),
    [isTokenFresh]
  );
  const syncRemainingVotes = useCallback(() => {
    const current = getRemainingGlobalVotes();
    setRemainingVotes(Number.isFinite(current) ? current : null);
  }, [setRemainingVotes]);

  const stageRender = useCallback(
    (pkg) => {
      if (!pkg) return;
      renderCounterRef.current += 1;
      const nextRenderId = renderCounterRef.current;
      setRenderId(nextRenderId);
      setDuel(pkg);
      if (IS_DEV_LOG) {
        console.log('[global-duel] render', {
          renderId: nextRenderId,
          photoIds: extractPhotoIds(pkg),
          token: tokenPrefix(pkg?.voteToken),
        });
      }
    },
    [setDuel, setRenderId]
  );

  const syncFromQueue = useCallback(async () => {
    await ensureFreshTokensForQueue('global');
    syncRemainingVotes();
    const head = getCurrentGlobalDuelPair();
    if (duelReady(head)) {
      stageRender(head);
      setLoading(false);
      ensurePreloadedGlobalDuels(PRELOADED_PAIR_COUNT).catch((error) =>
        console.error('Failed to keep preloading queue', error)
      );
      return;
    }
    // TODO: Currently, if the app is still loaded in background, and user's votes repopulate, the app may not check again for more votes. Observed when nav to vote tab off of notification, but votes appeared on app restart
    if (getRemainingGlobalVotes() === 0) {
      setDuel(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const next = await getOrLoadFirstGlobalDuelPair(PRELOADED_PAIR_COUNT);
    await ensureFreshTokensForQueue('global');
    syncRemainingVotes();
    if (getRemainingGlobalVotes() === 0) {
      setDuel(null);
      setLoading(false);
      return;
    }
    const refreshed = getCurrentGlobalDuelPair();
    const candidate = duelReady(refreshed) ? refreshed : next;
    if (!isActiveRef.current) return;
    if (duelReady(candidate)) {
      stageRender(candidate);
      setLoading(false);
    } else {
      setDuel(null);
      setLoading(true);
    }
  }, [
    duelReady,
    ensureFreshTokensForQueue,
    ensurePreloadedGlobalDuels,
    getCurrentGlobalDuelPair,
    getOrLoadFirstGlobalDuelPair,
    syncRemainingVotes,
  ]);

  const advanceQueue = useCallback(() => {
    const next = advanceGlobalDuelQueue(PRELOADED_PAIR_COUNT);
    syncRemainingVotes();
    if (getRemainingGlobalVotes() === 0) {
      setDuel(null);
      setLoading(false);
      return;
    }
    if (duelReady(next)) {
      stageRender(next);
      setLoading(false);
    } else {
      setDuel(null);
      setLoading(true);
      getOrLoadFirstGlobalDuelPair(PRELOADED_PAIR_COUNT).then((pkg) => {
        if (!isActiveRef.current) return;
        ensureFreshTokensForQueue('global').then(() => {
          const current = getCurrentGlobalDuelPair();
          const candidate = duelReady(current) ? current : pkg;
          syncRemainingVotes();
          if (getRemainingGlobalVotes() === 0) {
            setDuel(null);
            setLoading(false);
            return;
          }
          if (duelReady(candidate)) {
            stageRender(candidate);
            setLoading(false);
          }
        });
      });
    }
  }, [
    advanceGlobalDuelQueue,
    duelReady,
    ensureFreshTokensForQueue,
    getCurrentGlobalDuelPair,
    getOrLoadFirstGlobalDuelPair,
    getRemainingGlobalVotes,
    syncRemainingVotes,
  ]);

  useFocusEffect(
    useCallback(() => {
      isActiveRef.current = true;
      if (IS_DEV_LOG) {
        console.log('[vote] focus', { ts: Date.now() });
      }
      syncFromQueue();
      return () => {
        isActiveRef.current = false;
        if (IS_DEV_LOG) {
          console.log('[vote] blur', { ts: Date.now() });
        }
      };
    }, [syncFromQueue])
  );

  const choose = useCallback(
    async (winnerId, loserId, { advanceImmediately = false } = {}) => {
      if (!winnerId || !loserId || submitting) return;
      if (remainingVotes === 0) {
        setLoading(false);
        return;
      }
      let activeDuel = duel;
      if (!duelReady(activeDuel) || !isTokenFresh(activeDuel?.expiresAt)) {
        await ensureFreshTokensForQueue('global');
        const refreshed = getCurrentGlobalDuelPair();
        if (duelReady(refreshed)) {
          activeDuel = refreshed;
          stageRender(refreshed);
        } else {
          console.warn('No duel token available; fetching a new global duel');
          advanceQueue();
          return;
        }
      }
      if (isActiveRef.current) {
        setSubmitting(true);
      }
      if (Number.isFinite(remainingVotes)) {
        // TODO: Ensure these are properly set and pulled before next queue render, get an error with failed to submit on 7th vote
        const nextRemaining = Math.max(0, remainingVotes - 1);
        setRemainingVotes(nextRemaining);
        setRemainingGlobalVotes(nextRemaining);
      }
      if (advanceImmediately) {
        // TODO: Optimistic dismissal can re-show the same pair (p1, p2, p3, p1) because
        // the server only marks a slot consumed after vote submission; prefetch can
        // pull the same unconsumed pair. Needs reservation or client de-dup later.
        advanceQueue();
        advancedQueueAlready = true;
      }

      if (IS_DEV_LOG) {
        console.log('[global-duel] submit-call', {
          renderId,
          winnerPhotoId: winnerId,
          loserPhotoId: loserId,
          token: tokenPrefix(activeDuel?.voteToken),
          advancedQueueAlready,
        });
      }
      try {
        const result = await voteGlobalDuel({
          winnerPhotoId: winnerId,
          loserPhotoId: loserId,
          voteToken: activeDuel.voteToken,
          expiresAt: activeDuel.expiresAt,
          bucketType: activeDuel.bucketType,
          pinId: activeDuel.pinId,
        });
        const invalid = result?.invalidVoteToken;
        if ((result?.success || invalid) && !advanceImmediately) {
          advanceQueue();
        }
        if (result?.error === 'rate_limited' || result?.status === 429) {
          setRemainingVotes(0);
          setRemainingGlobalVotes(0);
          clearGlobalDuelQueue();
          setDuel(null);
          setLoading(false);
          return;
        }
        if (!result?.success && !invalid && isDevEnv) {
          console.warn('Global vote failed without advancing queue', result?.error);
        }
      } catch (error) {
        console.error('Failed to submit global vote', error);
        if (IS_DEV_LOG) {
          console.log('[global-duel] submit-error', {
            status: error?.response?.status,
            error: error?.message,
          });
        }
      } finally {
        if (isActiveRef.current) {
          setSubmitting(false);
        }
      }
    },
    [
      advanceQueue,
      duel,
      duelReady,
      ensureFreshTokensForQueue,
      getCurrentGlobalDuelPair,
      isDevEnv,
      isTokenFresh,
      remainingVotes,
      submitting,
    ]
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

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Vote!</Text>
          <Text style={styles.subtitle}>swipe to select</Text>
        </View>

        <View style={styles.body}>
          {!loading && photos.length >= 2 && duel?.bucketType === 'pin_random' && duel?.pinPrompt ? (
            <Text style={styles.pinPrompt}>{duel.pinPrompt}</Text>
          ) : null}
          {remainingVotes === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.emptyText}>
                No votes remaining, come back in {VOTE_LIMIT_WINDOW_MINUTES} minutes.
              </Text>
            </View>
          ) : loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.helperText}>Loading a new duel…</Text>
            </View>
          ) : photos.length < 2 ? (
            <View style={styles.centered}>
              <Text style={styles.emptyText}>Need at least two photos to start global voting.</Text>
            </View>
          ) : !isScreenFocused ? null : (
            <DuelDeck
              pair={photos}
              renderId={renderId}
              voteToken={duel?.voteToken}
              disabled={loading || submitting}
              onVote={chooseByIndex}
              deckStyle={styles.deckArea}
              renderMeta={(photo) => (
                <View style={styles.meta}>
                  <Text style={styles.metaTitle}>
                    {isPinRandom ? 'Local' : 'Global'} Elo{' '}
                    {Number.isFinite(isPinRandom ? photo?.local_elo : photo?.global_elo)
                      ? isPinRandom
                        ? photo.local_elo
                        : photo.global_elo
                      : 1000}
                  </Text>
                  <Text style={styles.metaDetail}>
                    W {isPinRandom ? photo?.local_wins ?? 0 : photo?.global_wins ?? 0} · L{' '}
                    {isPinRandom ? photo?.local_losses ?? 0 : photo?.global_losses ?? 0}
                  </Text>
                </View>
              )}
            />
          )}
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
    title: { fontSize: 24, fontWeight: '700', color: colors.primary },
    subtitle: { fontSize: 14, fontWeight: '500', color: colors.textMuted },
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
    pinPrompt: { color: colors.primary, fontSize: 20, fontWeight: '600', textAlign: 'center' },
  });
}
