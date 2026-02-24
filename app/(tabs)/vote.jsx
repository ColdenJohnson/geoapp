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
      let advancedQueueAlready = false;
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

  const voteSessionTitle = !loading && photos.length >= 2 && isPinRandom && duel?.pinPrompt
    ? duel.pinPrompt
    : isPinRandom
      ? 'Local Challenge'
      : 'Global Matchup';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {remainingVotes === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>
              You've used your votes for now.
              {'\n'}We don't do doom scrolling here.
              {'\n'}Post a challenge. Add a photo. Create!
            </Text>
          </View>
        ) : loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading a new duel…</Text>
          </View>
        ) : photos.length < 2 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>Need at least two photos to start global voting.</Text>
          </View>
        ) : !isScreenFocused ? null : (
          <View style={styles.voteStage}>
            <DuelDeck
              pair={photos}
              renderId={renderId}
              voteToken={duel?.voteToken}
              disabled={loading || submitting}
              onVote={chooseByIndex}
              deckStyle={styles.deckArea}
              renderMeta={(photo) => (
                <View style={styles.meta}>
                  <Text style={styles.metaLabel}>{isPinRandom ? 'Local' : 'Global'} Elo</Text>
                  <Text style={styles.metaHandle}>
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

            <View style={styles.topOverlay} pointerEvents="none">
              <Text style={styles.kicker}>Voting Session</Text>
              <Text style={styles.sessionTitle}>{voteSessionTitle}</Text>
              {Number.isFinite(remainingVotes) ? (
                <Text style={styles.remainingVotes}>{remainingVotes} votes left this hour</Text>
              ) : null}
            </View>

            <View style={styles.bottomOverlay} pointerEvents="none">
              <Text style={styles.helperText}>Slide to reveal the winner</Text>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#000000' },
    container: {
      flex: 1,
      backgroundColor: '#000000',
    },
    voteStage: { flex: 1, backgroundColor: '#000000' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    emptyText: {
      color: 'rgba(255, 255, 255, 0.84)',
      fontSize: 16,
      fontWeight: '700',
      lineHeight: 24,
      textAlign: 'center',
      paddingHorizontal: 24,
    },
    loadingText: { color: 'rgba(255, 255, 255, 0.7)', textAlign: 'center', fontSize: 14, fontWeight: '800' },
    deckArea: {
      flex: 1,
      width: '100%',
      backgroundColor: '#000000',
    },
    meta: {
      gap: 2,
      paddingVertical: 6,
      maxWidth: 280,
    },
    metaLabel: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.1,
      textTransform: 'uppercase',
      color: 'rgba(255, 255, 255, 0.56)',
    },
    metaHandle: {
      fontSize: 28,
      lineHeight: 32,
      fontWeight: '900',
      color: '#FFFFFF',
      letterSpacing: 0.2,
    },
    metaDetail: {
      fontSize: 12,
      color: 'rgba(245, 237, 232, 0.94)',
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    topOverlay: {
      position: 'absolute',
      top: 26,
      left: 14,
      right: 14,
      alignItems: 'center',
      zIndex: 20,
    },
    kicker: {
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 3.1,
      textTransform: 'uppercase',
      color: colors.primary,
    },
    sessionTitle: {
      marginTop: 4,
      fontSize: 24,
      fontWeight: '800',
      color: '#FFFFFF',
      textAlign: 'center',
      paddingHorizontal: 20,
      letterSpacing: 0.3,
    },
    remainingVotes: {
      marginTop: 8,
      fontSize: 10,
      color: 'rgba(255, 255, 255, 0.68)',
      textTransform: 'uppercase',
      fontWeight: '800',
      letterSpacing: 1.4,
    },
    bottomOverlay: {
      position: 'absolute',
      bottom: 30,
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 20,
    },
    helperText: {
      color: 'rgba(255, 255, 255, 0.62)',
      textAlign: 'center',
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
  });
}
