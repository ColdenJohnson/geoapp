import { SafeAreaView, View, Text, ScrollView, RefreshControl, Pressable, Alert, Share } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useContext, useMemo, useState } from 'react';
import { AuthContext } from '../../hooks/AuthContext';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import auth from '@react-native-firebase/auth';
import { usePalette } from '@/hooks/usePalette';
import { CTAButton } from '@/components/ui/Buttons';
import { FullscreenImageViewer } from '@/components/ui/FullscreenImageViewer';
import { createFormStyles } from '@/components/ui/FormStyles';
import {
  createProfileStyles,
  normalizeHandle,
  ProfileAchievementsCard,
  ProfileHeaderCard,
  ProfileStatsCard,
  ProfileTopPhotosCard,
} from '@/components/profile/ProfileShared';
import { spacing } from '@/theme/tokens';
import { PUBLIC_BASE_URL } from '@/lib/apiClient';

export default function UserProfileScreen() {
  const {
    user,
    setUser,
    profile,
    friends,
    stats,
    statsLoading,
    refreshStats,
    topPhotos,
    topPhotosLoading,
    refreshTopPhotos
  } = useContext(AuthContext);
  const [refreshing, setRefreshing] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState(null);
  const router = useRouter();
  const colors = usePalette();
  const styles = useMemo(() => createProfileStyles(colors), [colors]);
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

  const normalizedHandle = useMemo(() => normalizeHandle(profile?.handle), [profile?.handle]);
  const shareProfileUrl = useMemo(() => {
    if (!normalizedHandle) return null;
    return `${PUBLIC_BASE_URL}/friends_tab?handle=${encodeURIComponent(normalizedHandle)}`;
  }, [normalizedHandle]);

  const onShareProfile = useCallback(async () => {
    if (!shareProfileUrl) {
      Alert.alert('Share Profile', 'Set a unique handle before sharing your profile.');
      return;
    }
    const message = `Let's Quest together. Join me on SideQuest!`;
    try {
      await Share.share({
        title: 'Add me on SideQuest',
        message,
        url: shareProfileUrl,
      });
    } catch (error) {
      console.warn('Failed to share profile', error);
      Alert.alert('Share Profile', 'Unable to open the share menu right now.');
    }
  }, [shareProfileUrl]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: spacing['4xl'] }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing || statsLoading} onRefresh={onRefresh} />}
      >
        <ProfileHeaderCard
          profile={profile}
          subtitle={contactValue}
          onPressAvatar={() => router.push('/edit_profile')}
          formStyles={formStyles}
          styles={styles}
        />
        <View style={styles.shareRow}>
          <Pressable
            onPress={onShareProfile}
            style={({ pressed }) => [styles.sharePressable, pressed && styles.sharePressablePressed]}
          >
            <Text style={styles.sharePressableText}>Share Profile</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/edit_profile')}
            style={({ pressed }) => [styles.editIconPressable, pressed && styles.sharePressablePressed]}
            accessibilityRole="button"
            accessibilityLabel="Edit Profile"
          >
            <MaterialIcons name="edit" size={20} color={colors.primary} />
          </Pressable>
        </View>

        <ProfileAchievementsCard
          earnedBadgeIds={stats?.earned_badges}
          colors={colors}
          formStyles={formStyles}
          styles={styles}
        />
        <ProfileTopPhotosCard
          colors={colors}
          formStyles={formStyles}
          onPressPhoto={(photo) => {
            setSelectedUrl(photo?.file_url || null);
            setViewerVisible(true);
          }}
          styles={styles}
          topPhotos={topPhotos}
          topPhotosLoading={topPhotosLoading}
        />
        <ProfileStatsCard
          fallbackProfile={profile}
          formStyles={formStyles}
          friendCount={friends?.length}
          stats={stats}
          styles={styles}
        />

        {/* Actions */}
        <View style={styles.actions}>
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
      <FullscreenImageViewer
        visible={viewerVisible}
        imageUrl={selectedUrl}
        onClose={() => setViewerVisible(false)}
      />
    </SafeAreaView>
  );
}
