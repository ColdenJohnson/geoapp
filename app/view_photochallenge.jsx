import { useCallback, useEffect, useRef, useState, useMemo, useContext } from 'react';
import { StyleSheet, View, ActivityIndicator, FlatList, RefreshControl, Pressable, SafeAreaView, Text } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fetchPhotosByPinId, addPhoto, fetchChallengeByPinId, setPinPrivacy } from '@/lib/api';
import { readPinPhotosCache, writePinPhotosCache, readPinMetaCache, writePinMetaCache } from '@/lib/pinChallengeCache';
import { setUploadResolver } from '../lib/promiseStore';
import { goBackOrHome } from '@/lib/navigation';
import BottomBar from '@/components/ui/BottomBar';
import AppHeader from '@/components/ui/AppHeader';
import { CTAButton } from '@/components/ui/Buttons';
import { FullscreenImageViewer } from '@/components/ui/FullscreenImageViewer';
import { PreferenceToggleRow } from '@/components/ui/PreferenceToggleRow';
import { Toast, useToast } from '@/components/ui/Toast';
import { usePalette } from '@/hooks/usePalette';
import { AuthContext } from '@/hooks/AuthContext';

function sortPhotosByGlobalElo(rows) {
  if (!Array.isArray(rows)) return [];
  return [...rows].sort((a, b) => {
    const aElo = Number.isFinite(a?.global_elo) ? a.global_elo : 1000;
    const bElo = Number.isFinite(b?.global_elo) ? b.global_elo : 1000;
    return bElo - aElo;
  });
}

function mergeOptimisticPhotos(serverRows, optimisticPhotoUrls) {
  const ordered = Array.isArray(serverRows) ? serverRows : [];
  if (!Array.isArray(optimisticPhotoUrls) || optimisticPhotoUrls.length === 0) {
    return ordered;
  }
  const optimistic = optimisticPhotoUrls.map((url, index) => ({
    _id: `optimistic-${index}-${url}`,
    file_url: url,
    global_elo: 1000,
    global_wins: 0,
    global_losses: 0,
    created_by_handle: 'you',
    optimistic: true,
  }));
  const optimisticSet = new Set(optimisticPhotoUrls);
  return [
    ...optimistic,
    ...ordered.filter((photo) => !optimisticSet.has(photo?.file_url)),
  ];
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

export default function ViewPhotoChallengeScreen() {
  const {
    pinId,
    message: promptParam,
    created_by_handle: handleParam,
    optimistic_photo_urls: optimisticPhotoUrlsParam,
  } = useLocalSearchParams();   // pinId comes from router params
  const [serverPhotos, setServerPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [challengeMeta, setChallengeMeta] = useState(null);
  const privacySyncInFlightRef = useRef(false);
  const desiredPrivacyRef = useRef(null);
  const acknowledgedPrivacyRef = useRef(null);
  const router = useRouter();
  const { message: toastMessage, show: showToast, hide: hideToast } = useToast(3500);
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, invalidateStats } = useContext(AuthContext);
  const promptParamText = typeof promptParam === 'string' && promptParam.trim()
    ? promptParam.trim()
    : null;
  const handleParamText = typeof handleParam === 'string' && handleParam.trim()
    ? handleParam.trim()
    : null;
  const promptText = promptParamText || challengeMeta?.message || 'Prompt';
  const handleText = handleParamText || challengeMeta?.created_by_handle || null;
  const isOwner = Boolean(
    user?.uid &&
    typeof challengeMeta?.created_by === 'string' &&
    challengeMeta.created_by === user.uid
  );
  const isPrivateChallenge = challengeMeta?.isPrivate === true;
  const optimisticPhotoUrls = useMemo(() => {
    if (typeof optimisticPhotoUrlsParam !== 'string') return [];
    try {
      const parsed = JSON.parse(optimisticPhotoUrlsParam);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((url) => typeof url === 'string' && url.length > 0);
    } catch {
      return [];
    }
  }, [optimisticPhotoUrlsParam]);
  const photos = useMemo(
    () => mergeOptimisticPhotos(serverPhotos, optimisticPhotoUrls),
    [serverPhotos, optimisticPhotoUrls]
  );

  async function load({ showSpinner = true } = {}) {
    if (!pinId) return false;
    if (showSpinner) setLoading(true);
    try {
      const data = await fetchPhotosByPinId(pinId);
      const ordered = sortPhotosByGlobalElo(Array.isArray(data) ? data : []);
      setServerPhotos(ordered);
      prefetchPhotoUrls(ordered);
      await writePinPhotosCache(pinId, ordered);
      return true;
    } catch (e) {
      console.error('Failed to fetch photos for pin', pinId, e);
      return false;
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

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
        const ordered = sortPhotosByGlobalElo(cachedPhotos);
        setServerPhotos(ordered);
        setLoading(false);
        prefetchPhotoUrls(ordered);
      }
      if (cancelled) return;

      if (!hadCache) {
        setLoading(true);
        await load({ showSpinner: true });
        return;
      }

      if (!isFresh) {
        await load({ showSpinner: false });
      }
    }

    hydrateAndLoad();
    return () => {
      cancelled = true;
    };
  }, [pinId]);

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

  const onRefresh = async () => {
    setRefreshing(true);
    await load({ showSpinner: false });
    setRefreshing(false);
  };

  function uploadPhotoChallenge() {
    if (uploading) return;
    setUploading(true);
    showToast('Uploading photo…', 60000);
    let didFail = false;
    let didSucceed = false;
    const uploadPromise = new Promise((resolve) => {
      setUploadResolver(resolve);
      router.push({
        pathname: '/upload',
        params: {
          prompt: promptText,
        },
      });
    });

    uploadPromise
      .then(async (uploadResult) => {
        if (!uploadResult) { // If promise resolves to falsey (i.e. user exits upload screen)
          hideToast();
          didFail = true;
          return;
        }
        await addPhoto(pinId, uploadResult);
        invalidateStats();
        await load({ showSpinner: false });
        didSucceed = true;
        showToast('Upload success', 2200);
      })
      .catch((error) => {
        console.error('Failed to add photo after upload', error);
        didFail = true;
        showToast('Upload failed', 2500);
      })
      .finally(() => {
        if (!didFail && !didSucceed) {
          hideToast();
        }
        setUploading(false);
      });
  }

  return (
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
            data={photos}
            keyExtractor={(item, idx) => item._id ?? `${idx}` }
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Pressable onPress={() => { setSelectedUrl(item.file_url); setViewerVisible(true); }}>
                  <Image
                    source={{ uri: item.file_url }}
                    style={styles.image}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                </Pressable>
                <View style={styles.photoMeta}>
                  <View style={styles.metaBlock}>
                    <Text style={styles.metaTitle}>
                      Global Elo {Number.isFinite(item?.global_elo) ? item.global_elo : 1000}
                    </Text>
                    <Text style={styles.metaDetail}>
                      W {item?.global_wins ?? 0} · L {item?.global_losses ?? 0}
                    </Text>
                  </View>
                  <Text style={styles.metaHandle}>
                    {item?.created_by_handle ? `@${item.created_by_handle}` : 'anon'}
                  </Text>
                </View>
              </View>
            )}
          />
        )}
      </View>

      {/* Bottom, always-on-screen action bar (not absolute) */}
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
        <CTAButton title="Upload Photo" onPress={uploadPhotoChallenge} disabled={uploading} />
      </BottomBar>

      <FullscreenImageViewer
        visible={viewerVisible}
        imageUrl={selectedUrl}
        onClose={() => setViewerVisible(false)}
      />

      <Toast message={toastMessage} bottomOffset={140} />
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    privacyFooterRow: {
      marginBottom: 10,
    },
    container: { flex: 1, backgroundColor: colors.surface },
    listContent: { padding: 14, gap: 14, paddingBottom: 100 },
    card: {
      borderRadius: 24,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 10 },
      shadowRadius: 20,
      shadowOpacity: 0.12,
      elevation: 8,
    },
    image: { width: '100%', height: 350 },
    photoMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.bg,
      gap: 12,
    },
    metaBlock: { flex: 1, gap: 2 },
    metaTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.6, color: colors.text },
    metaDetail: { fontSize: 12, color: colors.textMuted, fontWeight: '700' },
    metaHandle: { fontSize: 11, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.8 },
  });
}
