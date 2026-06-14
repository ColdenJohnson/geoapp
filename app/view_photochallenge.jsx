import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  fetchChallengeByPinId,
  fetchPhotosByPinId,
  sendQuestChallenge,
  setPinPrivacy,
} from '@/lib/api';
import {
  readPinMetaCache,
  readPinPhotosCache,
  writePinMetaCache,
  writePinPhotosCache,
} from '@/lib/pinChallengeCache';
import { goBackOrHome } from '@/lib/navigation';
import {
  getChallengeUploadBlockedMessage,
  normalizeChallengeCoordinate,
} from '@/lib/challengeGeoAccess';
import {
  subscribeUploadQueue,
  syncQueuedPhotosForPin,
} from '@/lib/uploadQueue';
import BottomBar from '@/components/ui/BottomBar';
import AppHeader from '@/components/ui/AppHeader';
import { CTAButton } from '@/components/ui/Buttons';
import { PreferenceToggleRow } from '@/components/ui/PreferenceToggleRow';
import { Toast, useToast } from '@/components/ui/Toast';
import { AuthContext } from '@/hooks/AuthContext';
import { usePalette } from '@/hooks/usePalette';
import { PUBLIC_BASE_URL } from '@/lib/apiClient';
import { radii, shadows, spacing } from '@/theme/tokens';
import { textStyles } from '@/theme/typography';

function parseDateMs(value) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

const SORT_MODE_ELO = 'elo';
const SORT_MODE_DATE = 'date';

function sortPhotos(rows, mode = SORT_MODE_ELO) {
  if (!Array.isArray(rows)) return [];
  return [...rows].sort((a, b) => {
    const aElo = Number.isFinite(a?.global_elo) ? a.global_elo : 1000;
    const bElo = Number.isFinite(b?.global_elo) ? b.global_elo : 1000;
    const aCreatedAtMs = parseDateMs(a?.createdAt);
    const bCreatedAtMs = parseDateMs(b?.createdAt);
    if (mode === SORT_MODE_DATE) {
      if (bCreatedAtMs !== aCreatedAtMs) return bCreatedAtMs - aCreatedAtMs;
      return bElo - aElo;
    }
    if (bElo !== aElo) return bElo - aElo;
    return bCreatedAtMs - aCreatedAtMs;
  });
}

function mergeServerPhotosWithPending(serverRows, localRows) {
  const normalizedServerRows = Array.isArray(serverRows) ? serverRows : [];
  const normalizedLocalRows = Array.isArray(localRows) ? localRows : [];
  const optimisticRows = normalizedLocalRows.filter((photo) => photo?.optimistic === true);

  if (optimisticRows.length === 0) {
    return normalizedServerRows;
  }

  const serverFileUrls = new Set(
    normalizedServerRows
      .map((photo) => (typeof photo?.file_url === 'string' ? photo.file_url : null))
      .filter(Boolean)
  );

  const pendingRows = optimisticRows.filter((photo) => {
    const remoteFileUrl = typeof photo?.remote_file_url === 'string' ? photo.remote_file_url : null;
    return !remoteFileUrl || !serverFileUrls.has(remoteFileUrl);
  });

  return [...pendingRows, ...normalizedServerRows];
}

function prefetchPhotoUrls(rows) {
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    const url = row?.file_url;
    if (typeof url !== 'string' || !url) continue;
    Image.prefetch(url).catch((error) => {
      console.warn('Failed to prefetch pin photo', error);
    });
  }
}

function getOptimisticUploadState(photo) {
  if (photo?.optimistic !== true) return null;
  const state = typeof photo?.upload_state === 'string' ? photo.upload_state.trim() : '';
  return state || 'pending';
}

function formatOptimisticUploadStateLabel(state) {
  switch (state) {
    case 'uploading':
      return 'Uploading';
    case 'finalizing':
      return 'Finalizing';
    case 'failed':
      return 'Failed';
    case 'pending':
    default:
      return 'Pending';
  }
}

function normalizeParamText(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

export default function ViewPhotoChallengeScreen() {
  const {
    pinId,
    message: promptParam,
    created_by_handle: handleParam,
  } = useLocalSearchParams();
  const [serverPhotos, setServerPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [challengeMeta, setChallengeMeta] = useState(null);
  const [viewerLocation, setViewerLocation] = useState(null);
  const [sortMode, setSortMode] = useState(SORT_MODE_ELO);
  const [friendSelectorVisible, setFriendSelectorVisible] = useState(false);
  const [friendSelectorBusy, setFriendSelectorBusy] = useState(false);
  const serverPhotosRef = useRef([]);
  const sentChallengesRef = useRef({});
  const privacySyncInFlightRef = useRef(false);
  const desiredPrivacyRef = useRef(null);
  const acknowledgedPrivacyRef = useRef(null);
  const router = useRouter();
  const { message: toastMessage, show: showToast } = useToast(3500);
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, friends } = useContext(AuthContext);

  const promptParamText = normalizeParamText(promptParam);
  const handleParamText = normalizeParamText(handleParam);
  const promptText = promptParamText || challengeMeta?.message || 'Prompt';
  const handleText = handleParamText || challengeMeta?.created_by_handle || null;
  const isOwner = Boolean(
    user?.uid &&
    typeof challengeMeta?.created_by === 'string' &&
    challengeMeta.created_by === user.uid
  );
  const isPrivateChallenge = challengeMeta?.isPrivate === true;
  const uploadBlockedMessage = useMemo(() => {
    if (!pinId) {
      return 'No valid challenge selected.';
    }
    if (!challengeMeta) {
      return 'Checking challenge access...';
    }
    return getChallengeUploadBlockedMessage({
      challenge: challengeMeta,
      userLocation: viewerLocation,
    });
  }, [challengeMeta, pinId, viewerLocation]);
  const uploadVisuallyLocked = Boolean(uploadBlockedMessage);
  const photos = serverPhotos;
  const hasPendingPhotos = useMemo(
    () => photos.some((photo) => photo?.optimistic === true),
    [photos]
  );
  const sortedPhotos = useMemo(
    () => sortPhotos(photos, sortMode),
    [photos, sortMode]
  );
  const sortChipLabel = sortMode === SORT_MODE_ELO ? 'Elo Sorted' : 'Upload Date';
  const isGeoLocked = challengeMeta?.isGeoLocked !== false;

  useEffect(() => {
    serverPhotosRef.current = serverPhotos;
  }, [serverPhotos]);

  const refreshViewerLocation = useCallback(async () => {
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission?.status !== 'granted') {
        setViewerLocation(null);
        return null;
      }

      const lastKnownPosition = await Location.getLastKnownPositionAsync();
      const lastKnownCoords = normalizeChallengeCoordinate(lastKnownPosition);
      if (lastKnownCoords) {
        setViewerLocation(lastKnownCoords);
        return lastKnownCoords;
      }

      const currentPosition = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const currentCoords = normalizeChallengeCoordinate(currentPosition);
      setViewerLocation(currentCoords);
      return currentCoords;
    } catch (error) {
      console.warn('Failed to refresh viewer location for challenge upload', error);
      setViewerLocation(null);
      return null;
    }
  }, []);

  const loadPhotos = useCallback(async ({ showSpinner = true } = {}) => {
    if (!pinId) return false;
    if (showSpinner) setLoading(true);
    try {
      const [{ photos: cachedPhotos }, data] = await Promise.all([
        readPinPhotosCache(pinId, { ttlMs: Number.MAX_SAFE_INTEGER }),
        fetchPhotosByPinId(pinId),
      ]);
      const rows = Array.isArray(data) ? data : [];
      const localRows = Array.isArray(cachedPhotos) && cachedPhotos.length > 0
        ? cachedPhotos
        : serverPhotosRef.current;
      const mergedRows = mergeServerPhotosWithPending(rows, localRows);
      setServerPhotos(mergedRows);
      prefetchPhotoUrls(mergedRows);
      await writePinPhotosCache(pinId, mergedRows);
      return true;
    } catch (error) {
      console.error('Failed to fetch photos for pin', pinId, error);
      return false;
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [pinId]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateAndLoad() {
      if (!pinId) {
        setServerPhotos([]);
        setLoading(false);
        return;
      }

      const { photos: cachedPhotos, hadCache, isFresh } = await readPinPhotosCache(pinId);
      if (hadCache && !cancelled) {
        setServerPhotos(Array.isArray(cachedPhotos) ? cachedPhotos : []);
        setLoading(false);
        prefetchPhotoUrls(cachedPhotos);
      }
      if (cancelled) return;

      if (!hadCache) {
        setLoading(true);
        await loadPhotos({ showSpinner: true });
        return;
      }

      if (!isFresh) {
        await loadPhotos({ showSpinner: false });
      }
    }

    hydrateAndLoad();

    return () => {
      cancelled = true;
    };
  }, [loadPhotos, pinId]);

  useEffect(() => {
    let cancelled = false;

    async function syncQueuedPhotos() {
      if (!pinId) return;
      const queuedPhotos = await syncQueuedPhotosForPin(pinId);
      if (cancelled || !Array.isArray(queuedPhotos)) return;
      setServerPhotos(queuedPhotos);
      prefetchPhotoUrls(queuedPhotos);
    }

    void syncQueuedPhotos();
    const unsubscribe = subscribeUploadQueue(() => {
      void syncQueuedPhotos();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [pinId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function syncPhotosFromCache() {
        if (!pinId) return;
        const { photos: cachedPhotos, hadCache, isFresh } = await readPinPhotosCache(pinId);
        if (cancelled || !hadCache) return;
        setServerPhotos(Array.isArray(cachedPhotos) ? cachedPhotos : []);
        prefetchPhotoUrls(cachedPhotos);
        if (!isFresh) {
          await loadPhotos({ showSpinner: false });
        }
      }

      void syncPhotosFromCache();

      return () => {
        cancelled = true;
      };
    }, [loadPhotos, pinId])
  );

  useFocusEffect(
    useCallback(() => {
      void refreshViewerLocation();
    }, [refreshViewerLocation])
  );

  useEffect(() => {
    if (!pinId || !hasPendingPhotos) return;
    const timeoutId = globalThis.setTimeout(() => {
      void loadPhotos({ showSpinner: false });
    }, 1500);

    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, [hasPendingPhotos, loadPhotos, pinId]);

  useEffect(() => {
    let cancelled = false;

    async function loadChallengeMeta() {
      if (!pinId) {
        setChallengeMeta(null);
        return;
      }
      try {
        const challenge = await fetchChallengeByPinId(pinId);
        if (cancelled) return;
        if (!challenge) {
          showToast('This challenge is private or unavailable.', 2500);
          router.back();
          return;
        }
        void writePinMetaCache(pinId, challenge);
        const initialIsPrivate = challenge?.isPrivate === true;
        acknowledgedPrivacyRef.current = initialIsPrivate;
        desiredPrivacyRef.current = initialIsPrivate;
        setChallengeMeta(challenge);
      } catch (error) {
        console.error('Failed to fetch challenge metadata for pin', pinId, error);
      }
    }

    async function hydrateAndLoadChallengeMeta() {
      if (!pinId) {
        setChallengeMeta(null);
        return;
      }

      const { meta: cachedMeta, hadCache, isFresh } = await readPinMetaCache(pinId);
      if (hadCache && cachedMeta && typeof cachedMeta === 'object' && !cancelled) {
        setChallengeMeta(cachedMeta);
        const cachedIsPrivate = cachedMeta?.isPrivate === true;
        acknowledgedPrivacyRef.current = cachedIsPrivate;
        desiredPrivacyRef.current = cachedIsPrivate;
      }
      if (cancelled) return;

      if (hadCache && isFresh) {
        return;
      }
      await loadChallengeMeta();
    }

    hydrateAndLoadChallengeMeta();

    return () => {
      cancelled = true;
    };
  }, [pinId, router, showToast]);

  const flushPrivacyUpdates = useCallback(async () => {
    if (!pinId || !isOwner || privacySyncInFlightRef.current) return;
    privacySyncInFlightRef.current = true;
    try {
      while (
        typeof desiredPrivacyRef.current === 'boolean' &&
        desiredPrivacyRef.current !== acknowledgedPrivacyRef.current
      ) {
        const targetPrivacy = desiredPrivacyRef.current;
        const updatedPin = await setPinPrivacy(pinId, targetPrivacy);
        if (!updatedPin || typeof updatedPin?.isPrivate !== 'boolean') {
          const fallback = typeof acknowledgedPrivacyRef.current === 'boolean'
            ? acknowledgedPrivacyRef.current
            : false;
          desiredPrivacyRef.current = fallback;
          setChallengeMeta((prev) => {
            const next = {
              ...(prev || {}),
              isPrivate: fallback,
            };
            void writePinMetaCache(pinId, next);
            return next;
          });
          break;
        }
        const persisted = updatedPin.isPrivate === true;
        acknowledgedPrivacyRef.current = persisted;
        setChallengeMeta((prev) => {
          const next = {
            ...(prev || {}),
            ...updatedPin,
            isPrivate: persisted,
          };
          void writePinMetaCache(pinId, next);
          return next;
        });
      }
    } finally {
      privacySyncInFlightRef.current = false;
      if (
        typeof desiredPrivacyRef.current === 'boolean' &&
        desiredPrivacyRef.current !== acknowledgedPrivacyRef.current
      ) {
        flushPrivacyUpdates();
      }
    }
  }, [isOwner, pinId]);

  const onTogglePrivacy = useCallback((nextValue) => {
    if (!pinId || !isOwner) return;
    const optimisticValue = !!nextValue;
    desiredPrivacyRef.current = optimisticValue;
    setChallengeMeta((prev) => {
      const next = {
        ...(prev || {}),
        isPrivate: optimisticValue,
      };
      void writePinMetaCache(pinId, next);
      return next;
    });
    flushPrivacyUpdates();
  }, [flushPrivacyUpdates, isOwner, pinId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPhotos({ showSpinner: false });
    setRefreshing(false);
  }, [loadPhotos]);

  const uploadPhotoChallenge = useCallback(async () => {
    if (uploading) return;
    const latestViewerLocation = await refreshViewerLocation();
    const nextUploadBlockedMessage = !pinId
      ? 'No valid challenge selected.'
      : !challengeMeta
        ? 'Checking challenge access...'
        : getChallengeUploadBlockedMessage({
            challenge: challengeMeta,
            userLocation: latestViewerLocation || viewerLocation,
          });
    if (nextUploadBlockedMessage) {
      showToast(nextUploadBlockedMessage, 2500);
      return;
    }
    setUploading(true);
    router.push({
      pathname: '/upload',
      params: {
        prompt: promptText,
        pinId,
        created_by_handle: handleText || '',
      },
    });
    setUploading(false);
  }, [
    challengeMeta,
    handleText,
    pinId,
    promptText,
    refreshViewerLocation,
    router,
    showToast,
    uploading,
    viewerLocation,
  ]);

  const onToggleSortMode = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setSortMode((current) => current === SORT_MODE_ELO ? SORT_MODE_DATE : SORT_MODE_ELO);
  }, []);

  const handleShareChallenge = useCallback(async () => {
    if (!pinId) return;
    const shareUrl = `${PUBLIC_BASE_URL}/view_photochallenge/${encodeURIComponent(pinId)}`;
    const message = promptText
      ? `Check out this SideQuest quest: "${promptText}"`
      : 'Check out this SideQuest quest.';

    try {
      await Share.share({
        title: 'View this quest on SideQuest',
        message,
        url: shareUrl,
      });
    } catch (error) {
      console.warn('Failed to share challenge', error);
      showToast('Unable to open share menu', 2500);
    }
  }, [pinId, promptText, showToast]);

  const openQuestMap = useCallback(() => {
    if (!pinId) return;
    router.push({
      pathname: '/map',
      params: {
        pinId,
        message: promptText || '',
        created_by_handle: handleText || '',
      },
    });
  }, [handleText, pinId, promptText, router]);

  const handleOpenChallengeFriendSelector = useCallback(() => {
    if (!pinId) return;
    Haptics.selectionAsync().catch(() => {});
    setFriendSelectorVisible(true);
  }, [pinId]);

  const handleSendChallenge = useCallback(async (friend) => {
    if (!pinId || !friend?.uid) return;
    const alreadySent = sentChallengesRef.current[pinId]?.has(friend.uid);
    if (alreadySent) {
      showToast(`Already challenged ${friend.display_name || friend.handle || 'this friend'}`, 2200);
      return;
    }
    setFriendSelectorBusy(true);
    const result = await sendQuestChallenge(pinId, friend.uid);
    setFriendSelectorBusy(false);
    if (!result?.success) {
      if (result?.code === 'already_sent') {
        if (!sentChallengesRef.current[pinId]) sentChallengesRef.current[pinId] = new Set();
        sentChallengesRef.current[pinId].add(friend.uid);
        showToast(`Already challenged ${friend.display_name || friend.handle || 'this friend'}`, 2200);
      } else {
        showToast('Failed to send challenge', 2500);
      }
      return;
    }
    if (!sentChallengesRef.current[pinId]) sentChallengesRef.current[pinId] = new Set();
    sentChallengesRef.current[pinId].add(friend.uid);
    setFriendSelectorVisible(false);
    showToast(`Challenge sent to ${friend.display_name || friend.handle || 'friend'}!`, 2200);
  }, [pinId, showToast]);

  const openPhotoDetail = useCallback((photo) => {
    if (!photo?._id || !pinId) return;
    router.push({
      pathname: '/view_photo',
      params: {
        pinId,
        photoId: String(photo._id),
        message: promptText || '',
        created_by_handle: handleText || '',
      },
    });
  }, [handleText, pinId, promptText, router]);

  const renderPhotoTile = useCallback(({ item }) => (
    <Pressable onPress={() => openPhotoDetail(item)} style={styles.galleryTileShell}>
      <View style={styles.galleryTile}>
        <Image
          source={{ uri: item.file_url }}
          style={styles.galleryImage}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
        <View style={styles.galleryOverlay} />
        <View style={styles.galleryTileMeta}>
          <View style={styles.galleryHandleWrap}>
            <Text style={styles.galleryHandle} numberOfLines={1}>
              {item?.created_by_handle ? `@${item.created_by_handle}` : 'anon'}
            </Text>
          </View>
          {item?.optimistic ? (
            <View
              style={[
                styles.galleryStatusChip,
                item?.upload_state === 'failed'
                  ? styles.galleryStatusChipFailed
                  : styles.galleryStatusChipPending,
              ]}
            >
              <Text style={styles.galleryStatusText}>
                {formatOptimisticUploadStateLabel(getOptimisticUploadState(item))}
              </Text>
            </View>
          ) : (
            <View style={styles.galleryEloChip}>
              <MaterialIcons name="emoji-events" size={13} color={colors.primary} />
              <Text style={styles.galleryEloText}>
                {Number.isFinite(item?.global_elo) ? item.global_elo : 1000}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  ), [colors.primary, openPhotoDetail, styles]);

  return (
    <>
    <SafeAreaView style={styles.safe}>
      <AppHeader
        onBack={() => goBackOrHome(router)}
        backText={router?.canGoBack?.() ? 'Back' : 'Home'}
        title={promptText}
        subtitle={handleText ? `@${handleText}` : 'anon'}
      />
      <View style={styles.container}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
        ) : (
          <FlatList
            data={sortedPhotos}
            keyExtractor={(item, idx) => item._id ?? `${idx}`}
            numColumns={2}
            columnWrapperStyle={styles.galleryRow}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListHeaderComponent={(
              <View style={styles.headerIconRow}>
                <Pressable
                  onPress={onToggleSortMode}
                  style={({ pressed }) => [styles.sortChip, pressed && styles.headerIconBtnPressed]}
                  hitSlop={8}
                >
                  <MaterialIcons
                    name={sortMode === SORT_MODE_ELO ? 'emoji-events' : 'schedule'}
                    size={20}
                    color={colors.primary}
                  />
                  <Text style={styles.sortChipText}>{sortChipLabel}</Text>
                </Pressable>
                <Pressable
                  onPress={openQuestMap}
                  style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconBtnPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="View quest photo map"
                  hitSlop={8}
                >
                  <MaterialIcons name="map" size={20} color={colors.primary} />
                </Pressable>
                <Pressable
                  onPress={handleShareChallenge}
                  style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconBtnPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Share challenge"
                  hitSlop={8}
                >
                  <MaterialIcons name="share" size={20} color={colors.primary} />
                </Pressable>
                <Pressable
                  onPress={handleOpenChallengeFriendSelector}
                  style={({ pressed }) => [
                    styles.headerIconBtn,
                    pressed && !isGeoLocked && friends?.length && styles.headerIconBtnPressed,
                    (isGeoLocked || !friends?.length) && styles.headerIconBtnDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Challenge a friend"
                  disabled={isGeoLocked || !friends?.length}
                  hitSlop={8}
                >
                  <MaterialIcons name="send" size={20} color={isGeoLocked || !friends?.length ? colors.textMuted : colors.primary} />
                </Pressable>
              </View>
            )}
            ListEmptyComponent={(
              <View style={styles.emptyState}>
                <MaterialIcons name="photo-library" size={40} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>No photos yet</Text>
                <Text style={styles.emptyText}>
                  Upload the first photo to start this gallery.
                </Text>
              </View>
            )}
            renderItem={renderPhotoTile}
          />
        )}
      </View>

      <BottomBar>
        {isOwner ? (
          <PreferenceToggleRow
            label="Private (friends only)"
            value={isPrivateChallenge}
            onValueChange={onTogglePrivacy}
            disabled={!pinId || !isOwner}
            style={styles.privacyFooterRow}
          />
        ) : null}
        <CTAButton
          title="Upload Photo"
          onPress={uploadPhotoChallenge}
          disabled={uploading || !pinId}
          style={uploadVisuallyLocked ? styles.uploadButtonLocked : null}
          textStyle={uploadVisuallyLocked ? styles.uploadButtonLockedText : null}
        />
      </BottomBar>

      <Toast message={toastMessage} bottomOffset={140} />
    </SafeAreaView>

      <Modal
        visible={friendSelectorVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setFriendSelectorVisible(false)}
      >
        <Pressable
          style={styles.friendSelectorOverlay}
          onPress={() => setFriendSelectorVisible(false)}
        >
          <Pressable style={styles.friendSelectorSheet} onPress={() => {}}>
            <View style={styles.friendSelectorDragHandle} />
            <Text style={styles.friendSelectorTitle}>Challenge a Friend</Text>
            <Text style={styles.friendSelectorPrompt} numberOfLines={2}>
              "{promptText}"
            </Text>
            {!friends?.length ? (
              <Text style={styles.friendSelectorEmpty}>Add friends to send them challenges.</Text>
            ) : (
              <FlatList
                data={friends}
                keyExtractor={(item) => item?.uid || item?.handle || String(Math.random())}
                renderItem={({ item: friend }) => {
                  const alreadySent = !!(
                    pinId && sentChallengesRef.current[pinId]?.has(friend.uid)
                  );
                  return (
                    <Pressable
                      style={({ pressed }) => [
                        styles.friendSelectorRow,
                        alreadySent && styles.friendSelectorRowSent,
                        pressed && !alreadySent && !friendSelectorBusy ? styles.pressed : null,
                      ]}
                      onPress={() => {
                        if (alreadySent) {
                          showToast(`Already challenged ${friend.display_name || friend.handle || 'this friend'}`, 2200);
                          return;
                        }
                        if (!friendSelectorBusy) handleSendChallenge(friend);
                      }}
                      disabled={friendSelectorBusy}
                    >
                      <View style={styles.friendSelectorAvatar}>
                        <Text style={styles.friendSelectorAvatarText}>
                          {(friend.display_name || friend.handle || 'A').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.friendSelectorRowInfo}>
                        <Text style={[styles.friendSelectorName, alreadySent && styles.friendSelectorNameSent]}>
                          {friend.display_name || friend.handle || 'Friend'}
                        </Text>
                        {friend.handle ? (
                          <Text style={styles.friendSelectorHandleText}>@{friend.handle}</Text>
                        ) : null}
                      </View>
                      {alreadySent ? (
                        <Text style={styles.friendSelectorSentLabel}>Sent</Text>
                      ) : (
                        <MaterialIcons name="send" size={18} color={colors.primary} />
                      )}
                    </Pressable>
                  );
                }}
                style={styles.friendSelectorList}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    privacyFooterRow: {
      marginBottom: 10,
    },
    uploadButtonLocked: {
      backgroundColor: colors.border,
      borderColor: colors.border,
      shadowOpacity: 0,
      elevation: 0,
    },
    uploadButtonLockedText: {
      color: colors.textMuted,
    },
    container: { flex: 1, backgroundColor: colors.surface },
    listContent: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: 120,
      gap: spacing.md,
    },
    headerIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    sortChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    sortChipText: {
      ...textStyles.chip,
      color: colors.text,
    },
    headerIconBtn: {
      padding: spacing.xs,
    },
    headerIconBtnPressed: {
      opacity: 0.5,
    },
    headerIconBtnDisabled: {
      opacity: 0.35,
    },
    pressed: {
      opacity: 0.7,
    },
    friendSelectorOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    friendSelectorSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: spacing.md,
      paddingTop: 12,
      paddingBottom: 32,
      maxHeight: '75%',
    },
    friendSelectorDragHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border || '#ccc',
      alignSelf: 'center',
      marginBottom: 16,
    },
    friendSelectorTitle: {
      ...textStyles.titleStrong,
      color: colors.text,
      marginBottom: 6,
    },
    friendSelectorPrompt: {
      ...textStyles.body,
      color: colors.textSecondary || colors.text,
      marginBottom: 14,
      fontStyle: 'italic',
    },
    friendSelectorEmpty: {
      ...textStyles.body,
      color: colors.textSecondary || colors.text,
      textAlign: 'center',
      marginTop: 24,
      marginBottom: 24,
    },
    friendSelectorList: {
      flexGrow: 0,
    },
    friendSelectorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border || '#eee',
    },
    friendSelectorRowSent: {
      opacity: 0.45,
    },
    friendSelectorAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary || '#4A90D9',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    friendSelectorAvatarText: {
      ...textStyles.titleStrong,
      color: '#FFFFFF',
    },
    friendSelectorRowInfo: {
      flex: 1,
    },
    friendSelectorName: {
      ...textStyles.body,
      color: colors.text,
      fontWeight: '600',
    },
    friendSelectorNameSent: {
      color: colors.textSecondary || colors.text,
    },
    friendSelectorHandleText: {
      ...textStyles.bodyXs,
      color: colors.textSecondary || colors.text,
    },
    friendSelectorSentLabel: {
      ...textStyles.bodyXs,
      color: colors.textSecondary || colors.text,
    },
    galleryRow: {
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    galleryTileShell: {
      flexBasis: '48.2%',
      maxWidth: '48.2%',
      marginBottom: spacing.md,
    },
    galleryTile: {
      position: 'relative',
      borderRadius: 28,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      ...shadows.chip,
    },
    galleryImage: {
      width: '100%',
      aspectRatio: 3 / 4,
      backgroundColor: colors.border,
    },
    galleryOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(26, 26, 26, 0.12)',
    },
    galleryTileMeta: {
      position: 'absolute',
      left: spacing.sm,
      right: spacing.sm,
      bottom: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    galleryHandleWrap: {
      flex: 1,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radii.pill,
      backgroundColor: 'rgba(26, 26, 26, 0.54)',
    },
    galleryHandle: {
      ...textStyles.body3xsBold,
      color: '#FFFFFF',
      letterSpacing: 0.5,
    },
    galleryEloChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radii.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    galleryEloText: {
      ...textStyles.chipSmall,
      color: colors.text,
    },
    galleryStatusChip: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radii.pill,
      borderWidth: 1,
    },
    galleryStatusChipPending: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    galleryStatusChipFailed: {
      backgroundColor: colors.bg,
      borderColor: colors.danger,
    },
    galleryStatusText: {
      ...textStyles.chipSmall,
      color: colors.text,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing['2xl'],
      gap: spacing.sm,
    },
    emptyTitle: {
      ...textStyles.title,
      color: colors.text,
    },
    emptyText: {
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
  });
}
