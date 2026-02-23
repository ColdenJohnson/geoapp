import { useEffect, useState, useMemo, useContext } from 'react';
import { StyleSheet, View, ActivityIndicator, FlatList, Image, RefreshControl, Modal, Pressable, SafeAreaView, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fetchPhotosByPinId, addPhoto } from '@/lib/api';
import { setUploadResolver } from '../lib/promiseStore';
import BottomBar from '@/components/ui/BottomBar';
import { CTAButton } from '@/components/ui/Buttons';
import { Toast, useToast } from '@/components/ui/Toast';
import { usePalette } from '@/hooks/usePalette';
import { AuthContext } from '@/hooks/AuthContext';

export default function ViewPhotoChallengeScreen() {
  const {
    pinId,
    message: promptParam,
    created_by_handle: handleParam,
    optimistic_photo_urls: optimisticPhotoUrlsParam,
  } = useLocalSearchParams();   // pinId comes from router params
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const router = useRouter();
  const { message: toastMessage, show: showToast, hide: hideToast } = useToast(3500);
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const promptText = typeof promptParam === 'string' && promptParam.trim()
    ? promptParam
    : 'Prompt';
  const handleText = typeof handleParam === 'string' && handleParam.trim()
    ? handleParam
    : null;
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

  async function load() {
    if (!pinId) return;
    setLoading(true);
    try {
      const data = await fetchPhotosByPinId(pinId);
      if (Array.isArray(data)) {
        const ordered = [...data].sort((a, b) => {
          const aElo = Number.isFinite(a?.global_elo) ? a.global_elo : 1000;
          const bElo = Number.isFinite(b?.global_elo) ? b.global_elo : 1000;
          return bElo - aElo;
        });
        if (optimisticPhotoUrls.length) {
          const optimistic = optimisticPhotoUrls.map((url, index) => ({
            _id: `optimistic-${index}-${url}`,
            file_url: url,
            global_elo: 1000,
            global_wins: 0,
            global_losses: 0,
            created_by_handle: 'you',
            optimistic: true,
          }));
          const merged = [
            ...optimistic,
            ...ordered.filter((photo) => !optimisticPhotoUrls.includes(photo?.file_url)),
          ];
          setPhotos(merged);
        } else {
          setPhotos(ordered);
        }
      } else {
        setPhotos([]);
      }
    } catch (e) {
      console.error('Failed to fetch photos for pin', pinId, e);
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [pinId, optimisticPhotoUrls]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
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
        await load();
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
      <View style={styles.header}>
        <Text style={styles.headerText}>{promptText}</Text>
        <Text style={styles.headerHandle}>
          {handleText ? `@${handleText}` : 'anon'}
        </Text>
      </View>
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
                  <Image source={{ uri: item.file_url }} style={styles.image} resizeMode="cover" />
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
        <CTAButton title="Upload Photo" onPress={uploadPhotoChallenge} disabled={uploading} />
      </BottomBar>


      {/* Fullscreen image viewer */}
      <Modal visible={viewerVisible} transparent={true} animationType="fade" onRequestClose={() => setViewerVisible(false)}>
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewerVisible(false)}>
          <Image source={selectedUrl ? { uri: selectedUrl } : undefined} style={styles.viewerImage} resizeMode="contain" />
        </Pressable>
      </Modal>

      <Toast message={toastMessage} bottomOffset={140} />
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    header: {
      paddingHorizontal: 18,
      paddingTop: 14,
      paddingBottom: 14,
      backgroundColor: colors.bg,
      borderBottomWidth: 1,
      borderBottomColor: colors.barBorder,
    },
    headerText: {
      fontSize: 20,
      fontWeight: '900',
      color: colors.primary,
      letterSpacing: 0.4,
      fontFamily: 'SpaceMono',
    },
    headerHandle: {
      marginTop: 4,
      fontSize: 11,
      color: colors.textMuted,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
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
    viewerBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.9)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    viewerImage: {
      width: '100%',
      height: '100%',
    },
  });
}
