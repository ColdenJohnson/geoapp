import { ActivityIndicator, Alert, RefreshControl, SafeAreaView, ScrollView, Text, View } from 'react-native';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AuthContext } from '@/hooks/AuthContext';
import {
  acceptFriendRequest,
  fetchUserStats,
  fetchUserTopPhotos,
  fetchUsersByUID,
  removeFriend,
  requestFriend,
} from '@/lib/api';
import { goBackOrHome } from '@/lib/navigation';
import { usePalette } from '@/hooks/usePalette';
import { CTAButton } from '@/components/ui/Buttons';
import { FullscreenImageViewer } from '@/components/ui/FullscreenImageViewer';
import { createFormStyles } from '@/components/ui/FormStyles';
import AppHeader from '@/components/ui/AppHeader';
import {
  createProfileStyles,
  ProfileAchievementsCard,
  ProfileHeaderCard,
  ProfileStatsCard,
  ProfileTopPhotosCard,
} from '@/components/profile/ProfileShared';
import { spacing } from '@/theme/tokens';

function getFriendshipStatus(targetUid, viewerUid, friends, friendRequests) {
  if (!targetUid) return 'none';
  if (targetUid === viewerUid) return 'self';
  if (Array.isArray(friends) && friends.some((friend) => friend?.uid === targetUid)) {
    return 'accepted';
  }
  if (Array.isArray(friendRequests?.incoming) && friendRequests.incoming.some((friend) => friend?.uid === targetUid)) {
    return 'incoming';
  }
  if (Array.isArray(friendRequests?.outgoing) && friendRequests.outgoing.some((friend) => friend?.uid === targetUid)) {
    return 'outgoing';
  }
  return 'none';
}

export default function PublicUserProfileScreen() {
  const { uid: uidParam } = useLocalSearchParams();
  const {
    user,
    friends,
    friendsLoading,
    friendRequests,
    refreshFriends,
  } = useContext(AuthContext);
  const [profileData, setProfileData] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [topPhotosData, setTopPhotosData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [friendActionBusy, setFriendActionBusy] = useState(false);
  const [optimisticFriendshipStatus, setOptimisticFriendshipStatus] = useState(null);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState(null);
  const router = useRouter();
  const colors = usePalette();
  const styles = useMemo(() => createProfileStyles(colors), [colors]);
  const formStyles = useMemo(() => createFormStyles(colors), [colors]);
  const targetUid = useMemo(
    () => (Array.isArray(uidParam) ? uidParam[0] : uidParam) || null,
    [uidParam]
  );

  useEffect(() => {
    if (!targetUid || !user?.uid || targetUid !== user.uid) return;
    router.replace('/(tabs)/profile');
  }, [router, targetUid, user?.uid]);

  useEffect(() => {
    setOptimisticFriendshipStatus(null);
  }, [targetUid]);

  const loadProfileData = useCallback(async ({ silent = false } = {}) => {
    if (!targetUid) {
      setProfileData(null);
      setStatsData(null);
      setTopPhotosData([]);
      setLoading(false);
      return;
    }

    if (!silent) {
      setLoading(true);
    }

    try {
      const [nextProfile, nextStats, nextTopPhotos] = await Promise.all([
        fetchUsersByUID(targetUid),
        fetchUserStats(targetUid),
        fetchUserTopPhotos(targetUid, { limit: 2, metric: 'global' }),
      ]);
      setProfileData(nextProfile);
      setStatsData(nextStats);
      setTopPhotosData(Array.isArray(nextTopPhotos) ? nextTopPhotos : []);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [targetUid]);

  useEffect(() => {
    loadProfileData();
  }, [loadProfileData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadProfileData({ silent: true }),
        refreshFriends({ force: true }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [loadProfileData, refreshFriends]);

  const friendshipStatus = useMemo(
    () => getFriendshipStatus(targetUid, user?.uid, friends, friendRequests),
    [targetUid, user?.uid, friends, friendRequests]
  );

  useEffect(() => {
    if (optimisticFriendshipStatus && friendshipStatus === optimisticFriendshipStatus) {
      setOptimisticFriendshipStatus(null);
    }
  }, [friendshipStatus, optimisticFriendshipStatus]);

  const effectiveFriendshipStatus = optimisticFriendshipStatus || friendshipStatus;

  const onPressAddFriend = useCallback(async () => {
    if (!targetUid) return;
    setFriendActionBusy(true);
    setOptimisticFriendshipStatus('outgoing');
    try {
      const response = await requestFriend({ target_uid: targetUid });
      if (!response?.success) {
        setOptimisticFriendshipStatus(null);
        Alert.alert('Friend Request', response?.error || 'Failed to send friend request.');
        return;
      }
      setOptimisticFriendshipStatus(response?.status === 'accepted' ? 'accepted' : 'outgoing');
      await refreshFriends({ force: true });
    } finally {
      setFriendActionBusy(false);
    }
  }, [refreshFriends, targetUid]);

  const onPressAcceptFriend = useCallback(async () => {
    if (!targetUid) return;
    setFriendActionBusy(true);
    setOptimisticFriendshipStatus('accepted');
    try {
      const response = await acceptFriendRequest(targetUid);
      if (!response?.success) {
        setOptimisticFriendshipStatus(null);
        Alert.alert('Friend Request', response?.error || 'Failed to accept friend request.');
        return;
      }
      await refreshFriends({ force: true });
    } finally {
      setFriendActionBusy(false);
    }
  }, [refreshFriends, targetUid]);

  const onPressRemoveFriend = useCallback(async () => {
    if (!targetUid) return;
    setFriendActionBusy(true);
    setOptimisticFriendshipStatus('none');
    try {
      const response = await removeFriend(targetUid);
      if (!response?.success) {
        if (response?.statusCode === 404) {
          await Promise.all([
            loadProfileData({ silent: true }),
            refreshFriends({ force: true }),
          ]);
          return;
        }
        setOptimisticFriendshipStatus(null);
        Alert.alert('Remove Friend', response?.error || 'Failed to remove friend.');
        return;
      }
      await refreshFriends({ force: true });
    } finally {
      setFriendActionBusy(false);
    }
  }, [loadProfileData, refreshFriends, targetUid]);

  const profileAction = useMemo(() => {
    if (friendsLoading && !optimisticFriendshipStatus) {
      return null;
    }
    if (effectiveFriendshipStatus === 'none') {
      return {
        title: 'Add Friend',
        variant: 'filled',
        disabled: friendActionBusy,
        onPress: onPressAddFriend,
      };
    }
    if (effectiveFriendshipStatus === 'incoming') {
      return {
        title: 'Accept Friend',
        variant: 'filled',
        disabled: friendActionBusy,
        onPress: onPressAcceptFriend,
      };
    }
    if (effectiveFriendshipStatus === 'outgoing') {
      return {
        title: 'Request Pending',
        variant: 'secondary',
        disabled: true,
        onPress: undefined,
      };
    }
    if (effectiveFriendshipStatus === 'accepted') {
      return {
        title: 'Remove Friend',
        variant: 'secondary',
        disabled: friendActionBusy,
        onPress: onPressRemoveFriend,
      };
    }
    return null;
  }, [
    effectiveFriendshipStatus,
    friendActionBusy,
    friendsLoading,
    onPressAcceptFriend,
    onPressAddFriend,
    onPressRemoveFriend,
    optimisticFriendshipStatus,
  ]);

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader
        onBack={() => goBackOrHome(router)}
        backText={router.canGoBack?.() ? 'Back' : 'Home'}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: spacing['4xl'] }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading && !profileData ? (
          <View style={styles.centerRow}>
            <ActivityIndicator size="small" color={colors.text} />
          </View>
        ) : null}

        {!loading && !profileData ? (
          <View style={[formStyles.card, styles.statsCard]}>
            <Text style={styles.emptyText}>Unable to load this profile.</Text>
          </View>
        ) : null}

        {profileData ? (
          <>
            <ProfileHeaderCard
              profile={profileData}
              formStyles={formStyles}
              styles={styles}
            />
            {profileAction ? (
              <View style={styles.profileActionRow}>
                <CTAButton
                  title={profileAction.title}
                  variant={profileAction.variant}
                  disabled={profileAction.disabled}
                  onPress={profileAction.onPress}
                />
              </View>
            ) : null}
            <ProfileAchievementsCard
              earnedBadgeIds={statsData?.earned_badges}
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
              topPhotos={topPhotosData}
              topPhotosLoading={loading && topPhotosData.length === 0}
            />
            <ProfileStatsCard
              fallbackProfile={profileData}
              formStyles={formStyles}
              stats={statsData}
              styles={styles}
            />
          </>
        ) : null}
      </ScrollView>
      <FullscreenImageViewer
        visible={viewerVisible}
        imageUrl={selectedUrl}
        onClose={() => setViewerVisible(false)}
      />
    </SafeAreaView>
  );
}
