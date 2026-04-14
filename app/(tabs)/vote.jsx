import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';

import { voteGlobalDuel, isTokenFresh } from '@/lib/api';
import { usePalette } from '@/hooks/usePalette';
import DuelDeck from '@/components/vote/DuelDeck';
import { useBottomTabOverflow } from '@/components/ui/TabBarBackground';
import { PressHoldActionMenu, getPressHoldActionMenuPosition } from '@/components/ui/PressHoldActionMenu';
import { textStyles } from '@/theme/typography';
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
  reserveGlobalDuelPair,
} from '@/lib/globalDuelQueue';

const PRELOADED_PAIR_COUNT = DEFAULT_PRELOAD_COUNT;
const PHOTO_ACTION_MENU_SIZE = {
  width: 214,
  height: 206,
};

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

function pickFirstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function getVoteSessionTitle(duel, photos) {
  const photoPrompts = Array.from(
    new Set(
      (Array.isArray(photos) ? photos : [])
        .map((photo) => pickFirstNonEmpty(photo?.challenge_prompt, photo?.prompt))
        .filter(Boolean)
    )
  );
  if (photoPrompts.length === 1) {
    return {
      top: photoPrompts[0],
      middle: null,
      bottom: null,
    };
  }
  if (photoPrompts.length >= 2) {
    return {
      top: photoPrompts[0],
      middle: 'vs',
      bottom: photoPrompts[1],
    };
  }

  return {
    top: pickFirstNonEmpty(
      duel?.promptTitle,
      duel?.questPrompt,
      duel?.prompt,
      duel?.title,
    ) || 'Global Matchup',
    middle: null,
    bottom: null,
  };
}

export default function GlobalVoteScreen() {
  const [duel, setDuel] = useState(null);
  const [renderId, setRenderId] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [remainingVotes, setRemainingVotes] = useState(null);
  const [photoActionMenu, setPhotoActionMenu] = useState(null);
  const isActiveRef = useRef(false);
  const renderCounterRef = useRef(0);
  const isDevEnv = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
  const isScreenFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const bottomTabOverflow = useBottomTabOverflow();
  const voteBottomPadding = Math.max(0, insets.bottom + bottomTabOverflow);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const photos = useMemo(() => (Array.isArray(duel?.photos) ? duel.photos : []), [duel]);
  const voteSessionTitle = useMemo(() => getVoteSessionTitle(duel, photos), [duel, photos]);
  const photoActionSections = useMemo(() => ([
    {
      id: 'primary',
      layout: 'row',
      options: [
        {
          id: 'off_prompt',
          label: 'Off Prompt',
          iconName: 'alt-route',
        },
        {
          id: 'view_quest',
          label: 'View Quest',
          iconName: 'explore',
        },
      ],
    },
    {
      id: 'secondary',
      layout: 'list',
      options: [
        {
          id: 'report_photo',
          label: 'Report Photo',
          iconName: 'outlined-flag',
          iconColor: colors.danger,
          iconBackgroundColor: 'rgba(220,38,38,0.10)',
          textColor: colors.danger,
        },
      ],
    },
  ]), [colors.danger]);
  const photoActionMenuPosition = useMemo(() => {
    if (!photoActionMenu) return null;

    return getPressHoldActionMenuPosition({
      anchorX: photoActionMenu.x,
      anchorY: photoActionMenu.y,
      menuSize: PHOTO_ACTION_MENU_SIZE,
      windowWidth,
      windowHeight,
      topInset: insets.top,
      bottomInset: voteBottomPadding,
      margin: 16,
    });
  }, [insets.top, photoActionMenu, voteBottomPadding, windowHeight, windowWidth]);
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

  const closePhotoActionMenu = useCallback(() => {
    setPhotoActionMenu(null);
  }, []);

  const openPhotoActionMenu = useCallback((photo, side, event) => {
    if (!photo?._id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const pageX = event?.nativeEvent?.pageX;
    const pageY = event?.nativeEvent?.pageY;
    setPhotoActionMenu({
      photo,
      side,
      x: Number.isFinite(pageX) ? pageX : windowWidth / 2,
      y: Number.isFinite(pageY) ? pageY : Math.max(insets.top + 48, windowHeight - voteBottomPadding - 72),
    });
  }, [insets.top, voteBottomPadding, windowHeight, windowWidth]);

  const handlePhotoActionSelection = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    closePhotoActionMenu();
  }, [closePhotoActionMenu]);

  useEffect(() => {
    closePhotoActionMenu();
  }, [closePhotoActionMenu, renderId]);

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
      closePhotoActionMenu();
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
      const reservedPairKey = reserveGlobalDuelPair(activeDuel);
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
          pairKey: reservedPairKey,
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
        });
        if (Number.isFinite(result?.remainingVotes)) {
          setRemainingVotes(result.remainingVotes);
          setRemainingGlobalVotes(result.remainingVotes);
        }
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
        if (!result?.success && !invalid) {
          console.error('Global vote POST failed after optimistic reserve', {
            pairKey: reservedPairKey,
            photoIds: extractPhotoIds(activeDuel),
            status: result?.status,
            error: result?.error || 'unknown_error',
          });
          if (isDevEnv) {
            console.warn('Global vote failed without advancing queue', result?.error);
          }
        }
      } catch (error) {
        console.error('Failed to submit global vote after optimistic reserve', error);
        if (IS_DEV_LOG) {
          console.log('[global-duel] submit-error', {
            pairKey: reservedPairKey,
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
      closePhotoActionMenu,
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
        // Keep this DuelDeck unmount guard in place; removing it causes jitter in other parts of the app.
        // Do not remove this code.
        ) : !isScreenFocused ? null : (
          <View style={styles.voteStage}>
            <View style={styles.topChrome} pointerEvents="none">
              <Text style={styles.kicker}>Voting</Text>
              {Number.isFinite(remainingVotes) ? (
                <Text style={styles.remainingVotes}>{remainingVotes} votes left this hour</Text>
              ) : null}
            </View>

            <View style={styles.deckStage}>
              <DuelDeck
                pair={photos}
                renderId={renderId}
                voteToken={duel?.voteToken}
                disabled={loading || submitting || photoActionMenu !== null}
                onVote={chooseByIndex}
                deckStyle={styles.deckArea}
                renderAction={(photo, photoIndex) => {
                  const isRightPhoto = photoIndex === 1;

                  return (
                    <Pressable
                      style={({ pressed }) => [
                        styles.photoActionButton,
                        isRightPhoto && styles.photoActionButtonRight,
                        pressed && styles.photoActionButtonPressed,
                      ]}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={isRightPhoto ? 'Open right photo options' : 'Open left photo options'}
                      onPress={(event) => openPhotoActionMenu(photo, isRightPhoto ? 'right' : 'left', event)}
                    >
                      <MaterialIcons
                        name="more-horiz"
                        size={28}
                        color={colors.primaryTextOn}
                        style={styles.photoActionIcon}
                      />
                    </Pressable>
                  );
                }}
                renderMeta={(photo, photoIndex) => {
                  const isRightPhoto = photoIndex === 1;

                  return (
                    <View style={[styles.metaStack, isRightPhoto && styles.metaStackRight]}>
                      <View style={[styles.meta, isRightPhoto && styles.metaRight]}>
                        <Text style={[styles.metaLabel, isRightPhoto && styles.metaTextRight]}>
                          Global Elo
                        </Text>
                        <Text style={[styles.metaHandle, isRightPhoto && styles.metaTextRight]}>
                          {Number.isFinite(photo?.global_elo)
                            ? photo.global_elo
                            : 1000}
                        </Text>
                        <Text style={[styles.metaDetail, isRightPhoto && styles.metaTextRight]}>
                          W {photo?.global_wins ?? 0} · L {photo?.global_losses ?? 0}
                        </Text>
                      </View>
                    </View>
                  );
                }}
              />
            </View>

            <View style={[styles.bottomChrome, { paddingBottom: voteBottomPadding + 16 }]}>
              <Text style={styles.sessionTitle} numberOfLines={1}>
                {voteSessionTitle?.top}
              </Text>
              {voteSessionTitle?.middle ? (
                <Text style={styles.sessionVs}>{voteSessionTitle.middle}</Text>
              ) : null}
              {voteSessionTitle?.bottom ? (
                <Text style={styles.sessionTitle} numberOfLines={1}>
                  {voteSessionTitle.bottom}
                </Text>
              ) : null}
            </View>

            <PressHoldActionMenu
              visible={photoActionMenu !== null}
              position={photoActionMenuPosition}
              menuSize={PHOTO_ACTION_MENU_SIZE}
              titleLabel="Photo Options"
              title={photoActionMenu?.side === 'right' ? 'Right photo' : 'Left photo'}
              sections={photoActionSections}
              onRequestClose={closePhotoActionMenu}
              onOptionPress={handlePhotoActionSelection}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    voteStage: { flex: 1, backgroundColor: colors.surface },
    topChrome: {
      paddingTop: 18,
      paddingBottom: 16,
      paddingHorizontal: 14,
      alignItems: 'center',
      backgroundColor: colors.surface,
    },
    deckStage: {
      flex: 1,
      width: '100%',
      backgroundColor: colors.surface,
      justifyContent: 'center',
    },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    emptyText: {
      ...textStyles.bodyStrong,
      color: colors.text,
      lineHeight: 24,
      textAlign: 'center',
      paddingHorizontal: 24,
    },
    loadingText: { ...textStyles.buttonSmall, color: colors.textMuted, textAlign: 'center' },
    deckArea: {
      flex: 1,
      width: '100%',
      backgroundColor: colors.surface,
    },
    metaStack: {
      maxWidth: 280,
    },
    metaStackRight: {
      alignSelf: 'flex-end',
      alignItems: 'flex-end',
    },
    meta: {
      gap: 2,
      paddingVertical: 6,
    },
    metaRight: {
      alignSelf: 'flex-end',
    },
    metaLabel: {
      ...textStyles.eyebrow,
      letterSpacing: 1.1,
      color: colors.primary,
    },
    metaHandle: {
      ...textStyles.heading,
      fontSize: 28,
      lineHeight: 32,
      color: '#FFFFFF',
      letterSpacing: 0.2,
    },
    metaDetail: {
      ...textStyles.bodyXsStrong,
      color: '#FFFFFF',
      letterSpacing: 0.3,
    },
    metaTextRight: {
      textAlign: 'right',
    },
    kicker: {
      ...textStyles.kicker,
      color: colors.primary,
      marginBottom: 8,
    },
    sessionTitle: {
      ...textStyles.title,
      color: colors.text,
      textAlign: 'center',
      width: '100%',
      paddingHorizontal: 28,
      letterSpacing: 0.2,
    },
    sessionVs: {
      ...textStyles.bodySmall,
      color: colors.primary,
      textAlign: 'center',
      textTransform: 'lowercase',
      fontWeight: '400',
      letterSpacing: 0.2,
    },
    remainingVotes: {
      ...textStyles.buttonCapsSmall,
      color: colors.textMuted,
      letterSpacing: 1.2,
    },
    bottomChrome: {
      alignItems: 'center',
      paddingTop: 12,
      paddingHorizontal: 16,
      gap: 2,
    },
    photoActionButton: {
      minWidth: 40,
      minHeight: 40,
      alignSelf: 'flex-start',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    photoActionButtonRight: {
      alignSelf: 'flex-end',
    },
    photoActionButtonPressed: {
      opacity: 0.62,
    },
    photoActionIcon: {
      opacity: 0.78,
      textShadowColor: 'rgba(0, 0, 0, 0.28)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
  });
}
