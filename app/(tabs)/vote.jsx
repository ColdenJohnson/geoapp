import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import TopBar from '@/components/ui/TopBar';
import BottomBar from '@/components/ui/BottomBar';
import { CTAButton } from '@/components/ui/Buttons';
import { fetchGlobalDuel, voteGlobalDuel } from '@/lib/api';

export default function GlobalVoteScreen() {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const isActiveRef = useRef(false);

  const loadPair = useCallback(async () => {
    if (!isActiveRef.current) return;
    setLoading(true);
    try {
      const pair = await fetchGlobalDuel();
      if (isActiveRef.current) {
        setPhotos(Array.isArray(pair) ? pair : []);
      }
    } catch (error) {
      console.error('Failed to refresh global duel', error);
      if (isActiveRef.current) {
        setPhotos([]);
      }
    } finally {
      if (isActiveRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      isActiveRef.current = true;
      loadPair();
      return () => {
        isActiveRef.current = false;
      };
    }, [loadPair])
  );

  const choose = useCallback(
    async (winnerId, loserId) => {
      if (!winnerId || !loserId || submitting) return;
      if (isActiveRef.current) {
        setSubmitting(true);
      }
      try {
        const result = await voteGlobalDuel({ winnerPhotoId: winnerId, loserPhotoId: loserId });
        if (result?.success) {
          await loadPair();
        }
      } catch (error) {
        console.error('Failed to submit global vote', error);
      } finally {
        if (isActiveRef.current) {
          setSubmitting(false);
        }
      }
    },
    [loadPair, submitting]
  );

  return (
    <SafeAreaView style={styles.safe}>
      <TopBar title="Global Vote" subtitle="Pick the best photo worldwide" />
      <View style={styles.container}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" />
          </View>
        ) : photos.length < 2 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>Need at least two photos to start global voting.</Text>
          </View>
        ) : (
          <View style={styles.duelRow}>
            {photos.map((photo, idx) => {
              const opponent = photos[(idx + 1) % photos.length];
              return (
                <Pressable
                  key={photo._id ?? idx}
                  style={({ pressed }) => [
                    styles.photoCard,
                    pressed && !submitting ? styles.photoPressed : null,
                  ]}
                  onPress={() => choose(photo._id, opponent._id)}
                  disabled={submitting}
                >
                  <Image source={{ uri: photo.file_url }} style={styles.photo} resizeMode="cover" />
                  <View style={styles.meta}>
                    <Text style={styles.metaTitle}>Select</Text>
                    <Text style={styles.metaDetail}>Global Elo: {Number.isFinite(photo?.global_elo) ? photo.global_elo : 1000}</Text>
                    <Text style={styles.metaDetail}>
                      W {photo?.global_wins ?? 0} · L {photo?.global_losses ?? 0}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <BottomBar>
        <CTAButton
          title={loading ? 'Loading…' : 'Skip Pair'}
          onPress={() => {
            if (!loading && !submitting) {
              loadPair();
            }
          }}
          variant="primary"
        />
      </BottomBar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F7F7' },
  container: { flex: 1, padding: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#666', fontSize: 16, textAlign: 'center', paddingHorizontal: 12 },
  duelRow: { flexDirection: 'row', gap: 12, flex: 1 },
  photoCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    overflow: 'hidden',
  },
  photoPressed: { opacity: 0.9 },
  photo: { width: '100%', height: undefined, aspectRatio: 3 / 4 },
  meta: { padding: 12, gap: 4 },
  metaTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  metaDetail: { fontSize: 14, color: '#555', textAlign: 'center' },
});
