import { SafeAreaView, View, Text, ScrollView, RefreshControl, Pressable, Alert, Share, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { useCallback, useContext, useMemo, useRef, useState } from 'react';
import { APP_TUTORIAL_STEPS, AuthContext } from '../../hooks/AuthContext';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import auth from '@react-native-firebase/auth';
import { usePalette } from '@/hooks/usePalette';
import { FullscreenImageViewer } from '@/components/ui/FullscreenImageViewer';
import { TutorialCallout } from '@/components/ui/TutorialCallout';
import {
  createProfileStyles,
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
    profile,
    friends,
    stats,
    statsLoading,
    refreshStats,
    topPhotos,
    topPhotosLoading,
    refreshTopPhotos,
    isAppTutorialStepVisible,
    advanceAppTutorial,
  } = useContext(AuthContext);
  const [refreshing, setRefreshing] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState(null);
  const router = useRouter();
  const colors = usePalette();
  const styles = useMemo(() => createProfileStyles(colors), [colors]);
  const tutorialStyles = useMemo(() => createTutorialStyles(), []);
  const authUser = auth().currentUser;
  const showProfileEditTutorial = isAppTutorialStepVisible(APP_TUTORIAL_STEPS.PROFILE_EDIT);
  const profileTutorialVisitedRef = useRef(false);
  const contactValue =
    user?.phoneNumber ||
    authUser?.phoneNumber ||
    profile?.phone_number ||
    null;

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

  useFocusEffect(
    useCallback(() => {
      if (!showProfileEditTutorial) {
        profileTutorialVisitedRef.current = false;
        return undefined;
      }

      profileTutorialVisitedRef.current = true;

      return () => {
        if (!profileTutorialVisitedRef.current) {
          return;
        }
        profileTutorialVisitedRef.current = false;
        advanceAppTutorial(APP_TUTORIAL_STEPS.PROFILE_EDIT);
      };
    }, [advanceAppTutorial, showProfileEditTutorial])
  );

  const shareProfileUrl = useMemo(() => {
    if (!user?.uid) return null;
    return `${PUBLIC_BASE_URL}/user_profile/${encodeURIComponent(user.uid)}`;
  }, [user?.uid]);

  const onShareProfile = useCallback(async () => {
    if (!shareProfileUrl) {
      Alert.alert('Share Profile', 'Unable to build your profile link right now.');
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

  const onEditProfile = useCallback(() => {
    if (showProfileEditTutorial) {
      profileTutorialVisitedRef.current = false;
      advanceAppTutorial(APP_TUTORIAL_STEPS.PROFILE_EDIT);
    }
    router.push('/edit_profile');
  }, [advanceAppTutorial, router, showProfileEditTutorial]);

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
          onPressAvatar={onEditProfile}
          styles={styles}
        />
        <ProfileStatsCard
          fallbackProfile={profile}
          friendCount={friends?.length}
          stats={stats}
          styles={styles}
        />
        <View style={tutorialStyles.shareRowTutorialWrap}>
          {showProfileEditTutorial ? (
            <TutorialCallout
              title="Profile"
              body="Edit profile for your friends!"
              style={tutorialStyles.profileTutorialWrap}
              maxWidth={212}
              arrowSide="right"
              arrowOffset={16}
            />
          ) : null}
          <View style={styles.shareRow}>
            <Pressable
              onPress={onShareProfile}
              style={({ pressed }) => [styles.sharePressable, pressed && styles.sharePressablePressed]}
            >
              <Text style={styles.sharePressableText}>Share Profile</Text>
            </Pressable>
            <Pressable
              onPress={onEditProfile}
              style={({ pressed }) => [styles.editIconPressable, pressed && styles.sharePressablePressed]}
              accessibilityRole="button"
              accessibilityLabel="Edit Profile"
              testID="profile-edit-button"
            >
              <MaterialIcons name="edit" size={20} color={colors.primary} />
            </Pressable>
          </View>
        </View>

        <ProfileAchievementsCard
          earnedBadgeIds={stats?.earned_badges}
          colors={colors}
          styles={styles}
        />
        <ProfileTopPhotosCard
          colors={colors}
          onPressPhoto={(photo) => {
            setSelectedUrl(photo?.file_url || null);
            setViewerVisible(true);
          }}
          styles={styles}
          topPhotos={topPhotos}
          topPhotosLoading={topPhotosLoading}
        />
      </ScrollView>
      <FullscreenImageViewer
        visible={viewerVisible}
        imageUrl={selectedUrl}
        onClose={() => setViewerVisible(false)}
      />
    </SafeAreaView>
  );
}

function createTutorialStyles() {
  return StyleSheet.create({
    shareRowTutorialWrap: {
      width: '100%',
      position: 'relative',
      overflow: 'visible',
    },
    profileTutorialWrap: {
      position: 'absolute',
      right: 0,
      bottom: 50,
      alignItems: 'flex-end',
      zIndex: 5,
    },
  });
}
