import { SafeAreaView, StyleSheet, TouchableOpacity, View, Text, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';

import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useContext, useMemo, useState } from 'react';
import { AuthContext } from '../../hooks/AuthContext';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import emptyPfp from '@/assets/images/empty_pfp.png';
import auth from '@react-native-firebase/auth';
import { usePalette } from '@/hooks/usePalette';
import { CTAButton } from '@/components/ui/Buttons';
import { createFormStyles } from '@/components/ui/FormStyles';
import { spacing, fontSizes } from '@/theme/tokens';

export default function UserProfileScreen() {
  const {
    user,
    setUser,
    profile,
    stats,
    statsLoading,
    refreshStats,
    topPhotos,
    topPhotosLoading,
    refreshTopPhotos
  } = useContext(AuthContext);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const formStyles = useMemo(() => createFormStyles(colors), [colors]);
  const authUser = auth().currentUser;
  const contactValue =
    user?.email ||
    authUser?.phoneNumber ||
    profile?.email ||
    profile?.phone_number ||
    'No contact info on file';

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refreshStats({ force: true }),
      refreshTopPhotos({ force: true }),
    ]);
    setRefreshing(false);
  }, [refreshStats, refreshTopPhotos]);

  useFocusEffect(
    useCallback(() => {
      refreshTopPhotos({ force: false }).catch((error) => {
        console.warn('Failed to refresh top photos', error);
      });
    }, [refreshTopPhotos])
  );
  const displayedTopPhotos = useMemo(
    () => (Array.isArray(topPhotos) ? topPhotos.slice(0, 2) : []),
    [topPhotos]
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: spacing['4xl'] }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing || statsLoading} onRefresh={onRefresh} />}
      >
        {/* Profile Header -- could have a different profile picture */}
        <View style={[formStyles.card, styles.headerCard]}>
          <TouchableOpacity onPress={() => router.push('/edit_profile')}>
            <View style={styles.profileImageWrap}>
              <Image
                source={profile?.photo_url ? { uri: profile.photo_url } : emptyPfp}
                style={styles.profileImage}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            </View>
          </TouchableOpacity>
          <Text style={styles.displayName}>{profile?.display_name || 'No Display Name set'}</Text>
          <Text style={profile?.handle ? styles.handleText : styles.handlePlaceholder}>
            {profile?.handle ? `@${profile.handle}` : 'No handle set'}
          </Text>
          <Text style={styles.contactText}>{contactValue}</Text>
          {typeof profile?.bio === 'string' && profile.bio.trim() ? (
            <Text style={styles.bioText}>{profile.bio.trim()}</Text>
          ) : null}
        </View>

        {/* Profile Details */}
        <View style={[formStyles.card, styles.statsCard]}>
          <Text style={styles.sectionTitle}>Stats</Text>
          <Text style={styles.statsText}>Pins posted: {stats?.pin_count ?? profile?.pin_count ?? 0}</Text>
          <Text style={styles.statsText}>Photos posted: {stats?.photo_count ?? profile?.photo_count ?? 0}</Text>
        </View>

        <View style={[formStyles.card, styles.topPhotosCard]}>
          <Text style={styles.sectionTitle}>Top Elo Photos</Text>
          {topPhotosLoading && displayedTopPhotos.length === 0 ? (
            <View style={styles.centerRow}>
              <ActivityIndicator size="small" color={colors.text} />
            </View>
          ) : null}
          {!topPhotosLoading && displayedTopPhotos.length === 0 ? (
            <Text style={styles.emptyText}>No ranked photos yet.</Text>
          ) : null}
          {displayedTopPhotos.length ? (
            <View style={styles.topPhotosGrid}>
              {displayedTopPhotos.map((photo, index) => (
                <View key={photo?._id || `${index}`} style={styles.topPhotoTile}>
                  <Image
                    source={photo?.file_url ? { uri: photo.file_url } : undefined}
                    style={styles.topPhotoImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                  <View style={styles.topPhotoRankBadge}>
                    <Text style={styles.topPhotoRankText}>#{index + 1}</Text>
                  </View>
                  <View style={styles.topPhotoMeta}>
                    <Text style={styles.topPhotoElo}>
                      Elo {Number.isFinite(photo?.global_elo) ? photo.global_elo : 1000}
                    </Text>
                  </View>
                </View>
              ))}
              {displayedTopPhotos.length < 2 ? (
                <View style={[styles.topPhotoTile, styles.topPhotoPlaceholder]}>
                  <Text style={styles.topPhotoPlaceholderText}>Waiting for more ranked photos</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <CTAButton
            title="Edit Profile"
            onPress={() => router.push('/edit_profile')}
            variant="primary"
          />

          {/* Sign Out button, theoretically. */}
          <View style={styles.actionRow}>
            <CTAButton
              title="Sign Out"
              onPress={async () => {
                try {
                  await auth().signOut();
                  await AsyncStorage.removeItem('user_token');
                  setUser(null); // clear user state, automatically rerun RootLayout

                  console.log('User signed out');
                } catch (error) {
                  console.error('Sign out failed:', error);
                }
              }}
              style={styles.actionButtonLast}
              variant="primary"
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      flexGrow: 1,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing['2xl'],
      width: '100%',
      maxWidth: 520,
      alignSelf: 'center',
    },
    headerCard: {
      alignItems: 'center',
      marginBottom: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: spacing.lg,
    },
    profileImageWrap: {
      width: 96,
      height: 96,
      borderRadius: 48,
      marginBottom: spacing.md,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    profileImage: {
      width: 96,
      height: 96,
      borderRadius: 48,
    },
    displayName: {
      fontSize: fontSizes['2xl'],
      fontWeight: '900',
      color: colors.primary,
      fontFamily: 'SpaceMono',
      letterSpacing: 0.3,
      textAlign: 'center',
    },
    handleText: {
      color: colors.textMuted,
      marginTop: spacing.xs,
      textAlign: 'center',
      fontWeight: '700',
    },
    handlePlaceholder: {
      color: colors.textMuted,
      marginTop: spacing.xs,
      textAlign: 'center',
      fontStyle: 'italic',
    },
    contactText: {
      color: colors.textMuted,
      marginTop: spacing.xs,
      textAlign: 'center',
      fontWeight: '600',
    },
    bioText: {
      marginTop: spacing.sm,
      textAlign: 'center',
      color: colors.textMuted,
      fontSize: fontSizes.md,
      lineHeight: 20,
      fontWeight: '600',
      maxWidth: 320,
      alignSelf: 'center',
    },
    statsCard: {
      marginBottom: spacing.lg,
    },
    topPhotosCard: {
      marginBottom: spacing.lg,
    },
    friendsCard: {
      marginBottom: spacing.lg,
    },
    requestsCard: {
      marginBottom: spacing.lg,
    },
    searchInput: {
      marginTop: spacing.sm,
    },
    friendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.md - 2,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    friendInfo: {
      flex: 1,
      paddingRight: spacing.sm,
    },
    friendName: {
      color: colors.text,
      fontWeight: '700',
    },
    friendMeta: {
      color: colors.textMuted,
      fontSize: fontSizes.sm,
      marginTop: 3,
      fontWeight: '700',
    },
    miniActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    summaryRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    summaryCount: {
      color: colors.textMuted,
      fontSize: fontSizes.sm,
      fontWeight: '800',
      letterSpacing: 1,
    },
    subSectionTitle: {
      marginTop: spacing.md,
      marginBottom: spacing.xs,
      fontSize: fontSizes.sm,
      fontWeight: '800',
      letterSpacing: 1.1,
      textTransform: 'uppercase',
      color: colors.text,
    },
    emptyText: {
      color: colors.textMuted,
      marginTop: spacing.sm,
    },
    centerRow: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.sm,
    },
    pendingText: {
      color: colors.textMuted,
      fontSize: fontSizes.sm,
      fontWeight: '700',
    },
    sectionTitle: {
      fontSize: fontSizes.lg,
      fontWeight: '900',
      letterSpacing: 0.4,
      color: colors.primary,
      marginBottom: spacing.sm,
    },
    statsText: {
      color: colors.textMuted,
      lineHeight: 24,
      fontWeight: '700',
    },
    topPhotosGrid: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    topPhotoTile: {
      flex: 1,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      aspectRatio: 4 / 5,
    },
    topPhotoImage: {
      width: '100%',
      height: '100%',
    },
    topPhotoRankBadge: {
      position: 'absolute',
      top: spacing.sm,
      left: spacing.sm,
      backgroundColor: 'rgba(255,255,255,0.9)',
      borderRadius: 10,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
    },
    topPhotoRankText: {
      color: colors.primary,
      fontSize: fontSizes.sm,
      fontWeight: '900',
    },
    topPhotoMeta: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(12, 7, 3, 0.55)',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    topPhotoElo: {
      color: '#FFFFFF',
      fontSize: fontSizes.sm,
      fontWeight: '800',
      letterSpacing: 0.4,
      textAlign: 'center',
    },
    topPhotoPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
      borderStyle: 'dashed',
    },
    topPhotoPlaceholderText: {
      color: colors.textMuted,
      fontSize: fontSizes.sm,
      fontWeight: '700',
      textAlign: 'center',
      paddingHorizontal: spacing.md,
    },
    actions: {
      marginTop: spacing.md,
    },
    actionRow: {
      flexDirection: 'row',
      marginTop: spacing.md,
    },
    actionButtonLast: {
      flex: 1,
      marginRight: 0,
    },
  });
}
