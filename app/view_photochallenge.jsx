import { useEffect, useState, useCallback, useMemo } from 'react';
import { StyleSheet, View, ActivityIndicator, FlatList, Image, RefreshControl, Modal, Pressable, Text, SafeAreaView } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { fetchPhotosByPinId, addPhoto, fetchChallengeByPinId, fetchDuelByPinId, voteDuel } from '@/lib/api';
import { useFocusEffect } from '@react-navigation/native';
import { setUploadResolver } from '../lib/promiseStore';
import BottomBar from '@/components/ui/BottomBar';
import { CTAButton } from '@/components/ui/Buttons';
import TopBar from '@/components/ui/TopBar';
import { usePalette } from '@/hooks/usePalette';
import DuelDeck from '@/components/vote/DuelDeck';

export default function ViewPhotoChallengeScreen() {
  const { pinId } = useLocalSearchParams();   // pinId comes from router params
  const [photos, setPhotos] = useState([]);
  const [ challengeDetails, setChallengeDetails ] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState(null);
  const [duelPhotos, setDuelPhotos] = useState([]);
  const [duelLoading, setDuelLoading] = useState(false);
  const router = useRouter();
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
  // Auto-load a duel pair for the header section when pin changes
  useEffect(() => { loadDuel(); }, [pinId]);

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

  async function loadDuel() {
    if (!pinId) return;
    setDuelLoading(true);
    try {
      const pair = await fetchDuelByPinId(pinId);
      setDuelPhotos(Array.isArray(pair) ? pair : []);
    } finally {
      setDuelLoading(false);
    }
  }

  async function choose(winnerId, loserId) {
    try {
      await voteDuel({ pinId, winnerPhotoId: winnerId, loserPhotoId: loserId });
    } catch (error) {
      console.error('Failed to submit duel vote', error);
    } finally {
      await loadDuel(); // get next pair
    }
  }

  const handleDuelVote = useCallback(
    (winnerIndex, pairOverride) => {
      const pair = Array.isArray(pairOverride) ? pairOverride : duelPhotos;
      if (!Array.isArray(pair) || pair.length < 2) return;
      const winner = pair[winnerIndex];
      const loser = pair[winnerIndex === 0 ? 1 : 0];
      if (!winner?._id || !loser?._id) return;
      choose(winner._id, loser._id);
    },
    [choose, duelPhotos]
  );

    async function uploadPhotoChallenge() {
    const uploadResult = await new Promise((resolve) => {
      setUploadResolver(resolve);
      router.push('/upload');
    });
  
    await addPhoto(pinId, uploadResult);
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
            ListHeaderComponent={
              <View style={{ marginBottom: 20 }}>
                <Text style={[styles.quickVoteTitle, { marginLeft: 4 }]}>Quick Vote</Text>
                <View style={styles.quickVoteCard}>
                  {duelPhotos?.length >= 2 ? (
                    <DuelDeck
                      pair={duelPhotos}
                      disabled={duelLoading}
                      onVote={handleDuelVote}
                      deckStyle={styles.quickVoteDeck}
                      cardAspectRatio={16 / 12}
                      renderMeta={(photo) => (
                        <View style={styles.quickVoteMetaOverlay}>
                          <Text style={styles.quickVoteMetaText}>
                            Elo {Number.isFinite(photo?.elo) ? photo.elo : 1000}
                          </Text>
                        </View>
                      )}
                    />
                  ) : (
                    <View style={{ alignItems: 'center', padding: 16 }}>
                      <Text style={{ color: colors.textMuted, marginBottom: 8 }}>{duelLoading ? 'Loading pair...' : 'Not enough photos to start a duel'}</Text>
                    </View>
                  )}
                </View>
              </View>
            }
          />
        )}
      </View>

      {/* Bottom, always-on-screen action bar (not absolute) */}
      <BottomBar>
        <CTAButton title="Upload Photo" onPress={uploadPhotoChallenge} />
      </BottomBar>

      {/* Fullscreen image viewer */}
      <Modal visible={viewerVisible} transparent={true} animationType="fade" onRequestClose={() => setViewerVisible(false)}>
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewerVisible(false)}>
          <Image source={selectedUrl ? { uri: selectedUrl } : undefined} style={styles.viewerImage} resizeMode="contain" />
        </Pressable>
      </Modal>
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
    quickVoteTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8, color: colors.text },
    quickVoteCard: {
      padding: 8,
      backgroundColor: colors.bg,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    quickVoteDeck: {
      height: 200,
      maxWidth: 520,
    },
    quickVoteMetaOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingVertical: 6,
      paddingHorizontal: 10,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    quickVoteMetaText: { fontSize: 12, fontWeight: '600', color: '#FFFFFF' },
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
