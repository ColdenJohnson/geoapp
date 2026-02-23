import { SafeAreaView, StyleSheet, TouchableOpacity, View, Text, ScrollView, RefreshControl } from 'react-native';
import { Image } from 'expo-image';

import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useContext, useMemo, useState } from 'react';
import { AuthContext } from '../../hooks/AuthContext';
import { useRouter } from 'expo-router';

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
    refreshStats
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
    await refreshStats({ force: true });
    setRefreshing(false);
  }, [refreshStats]);

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
        </View>

        {/* Profile Details */}
        <View style={[formStyles.card, styles.statsCard]}>
          <Text style={styles.sectionTitle}>Stats</Text>
          <Text style={styles.statsText}>Pins posted: {stats?.pin_count ?? profile?.pin_count ?? 0}</Text>
          <Text style={styles.statsText}>Photos posted: {stats?.photo_count ?? profile?.photo_count ?? 0}</Text>
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
    statsCard: {
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
