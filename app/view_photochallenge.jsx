import { useEffect, useState, useCallback, useMemo, useContext } from 'react';
import { StyleSheet, View, ActivityIndicator, FlatList, Image, RefreshControl, Modal, Pressable, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fetchPhotosByPinId, addPhoto, fetchChallengeByPinId } from '@/lib/api';
import { useFocusEffect } from '@react-navigation/native';
import { setUploadResolver } from '../lib/promiseStore';
import BottomBar from '@/components/ui/BottomBar';
import { CTAButton } from '@/components/ui/Buttons';
import TopBar from '@/components/ui/TopBar';
import { Toast, useToast } from '@/components/ui/Toast';
import { usePalette } from '@/hooks/usePalette';
import { AuthContext } from '@/hooks/AuthContext';

export default function ViewPhotoChallengeScreen() {
  const { pinId } = useLocalSearchParams();   // pinId comes from router params
  const [photos, setPhotos] = useState([]);
  const [ challengeDetails, setChallengeDetails ] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const router = useRouter();
  const { invalidateStats } = useContext(AuthContext);
  const { message: toastMessage, show: showToast, hide: hideToast } = useToast(3500);
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  async function load() {
    if (!pinId) return;
    setLoading(true);
    try {
      const data = await fetchPhotosByPinId(pinId);
      setPhotos(Array.isArray(data) ? data : []);
      const challengeData = await fetchChallengeByPinId(pinId);
      setChallengeDetails(challengeData);
    } catch (e) {
      console.error('Failed to fetch photos for pin', pinId, e);
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [pinId]);

    useFocusEffect(
    useCallback(() => {
      // refresh when returning from the Upload screen
      load();
    }, [pinId])
  );


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
      router.push('/upload');
    });

    uploadPromise
      .then(async (uploadResult) => {
        if (!uploadResult) {
          didFail = true;
          showToast('Upload failed', 2500);
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
      <TopBar title={`Photo Challenge ${pinId}`} subtitle={`Prompt: ${challengeDetails?.message}`} />
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
    safe: { flex: 1, backgroundColor: colors.bg },
    container: { flex: 1, backgroundColor: colors.surface },
    listContent: { padding: 12, gap: 12, paddingBottom: 96 },
    card: {
      borderRadius: 10,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    image: { width: '100%', height: 220 },
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
