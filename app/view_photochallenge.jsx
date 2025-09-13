import { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, ActivityIndicator, FlatList, Image, RefreshControl, Modal, Pressable, Text, SafeAreaView } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { fetchPhotosByPinId, addPhoto } from '@/lib/api';
import { useFocusEffect } from '@react-navigation/native';
import { setUploadResolver } from '../lib/promiseStore';

export default function ViewPhotoChallengeScreen() {
  const { pinId } = useLocalSearchParams();   // pinId comes from router params
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState(null);
  const router = useRouter();

  async function load() {
    if (!pinId) return;
    setLoading(true);
    try {
      const data = await fetchPhotosByPinId(pinId);
      setPhotos(Array.isArray(data) ? data : []);
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

    async function uploadPhotoChallenge() {
    const uploadResult = await new Promise((resolve) => {
      setUploadResolver(resolve);
      router.push('/upload');
    });
  
    await addPhoto(pinId, uploadResult);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Photo Challenge' }} />
      <View style={styles.container}>
        {loading ? (
          <ActivityIndicator size="large" style={{ marginTop: 24 }} />
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
      <View style={styles.bottomBar}>
        <View style={styles.bottomBarInner}>
          <Pressable
            onPress={uploadPhotoChallenge}
            style={({ pressed }) => [styles.ctaButton, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.ctaText}>Upload Photo</Text>
          </Pressable>
        </View>
      </View>

      {/* Fullscreen image viewer */}
      <Modal visible={viewerVisible} transparent={true} animationType="fade" onRequestClose={() => setViewerVisible(false)}>
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewerVisible(false)}>
          <Image source={selectedUrl ? { uri: selectedUrl } : undefined} style={styles.viewerImage} resizeMode="contain" />
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F7F7' },
  container: { flex: 1, backgroundColor: 'white' },
  listContent: { padding: 12, gap: 12, paddingBottom: 96 },
  card: {
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    backgroundColor: '#fff',
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
  bottomBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    // subtle elevation/shadow so it sits visually above other content
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: -2 },
    shadowRadius: 6,
    elevation: 6,
    zIndex: 10,
  },
  bottomBarInner: {
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  ctaButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6E6E6',
    // pill-like shadow similar to Duolingo UI chip
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
  },
  ctaText: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: '#1DA1F2',
  },
});