import { StyleSheet, TextInput, TouchableOpacity, View, Text, Alert, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { Image } from 'expo-image';

import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useContext, useMemo, useState } from 'react';
import { AuthContext } from '../../hooks/AuthContext';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  deleteMyAccount,
  searchUserByHandle,
  requestFriend,
  acceptFriendRequest
} from '@/lib/api';

import emptyPfp from '@/assets/images/empty_pfp.png';
import auth from '@react-native-firebase/auth';
import { usePalette } from '@/hooks/usePalette';
import { CTAButton, SecondaryButton } from '@/components/ui/Buttons';
import { createFormStyles } from '@/components/ui/FormStyles';
import { spacing, fontSizes } from '@/theme/tokens';

export default function UserProfileScreen() {
  const {
    user,
    setUser,
    profile,
    friends,
    friendRequests,
    friendsLoading,
    stats,
    statsLoading,
    refreshFriends,
    refreshStats,
    invalidateFriends
  } = useContext(AuthContext);
  const [friendSearchInput, setFriendSearchInput] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searchMessage, setSearchMessage] = useState(null);
  const [searching, setSearching] = useState(false);
  const [friendActionBusy, setFriendActionBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
      refreshFriends({ force: true }),
      refreshStats({ force: true })
    ]);
    setRefreshing(false);
  }, [refreshFriends, refreshStats]);

  const recentFriends = useMemo(() => {
    return [...friends]
      .sort((a, b) => new Date(b?.accepted_at || 0) - new Date(a?.accepted_at || 0))
      .slice(0, 2);
  }, [friends]);

  const recentIncoming = useMemo(() => {
    return [...(friendRequests.incoming || [])]
      .sort((a, b) => new Date(b?.requested_at || 0) - new Date(a?.requested_at || 0))
      .slice(0, 2);
  }, [friendRequests.incoming]);

  const recentOutgoing = useMemo(() => {
    return [...(friendRequests.outgoing || [])]
      .sort((a, b) => new Date(b?.requested_at || 0) - new Date(a?.requested_at || 0))
      .slice(0, 2);
  }, [friendRequests.outgoing]);

  const renderMiniList = (items, emptyLabel, rightAction) => {
    if (friendsLoading) {
      return (
        <View style={styles.centerRow}>
          <ActivityIndicator size="small" color={colors.text} />
        </View>
      );
    }
    if (!items.length) {
      return <Text style={styles.emptyText}>{emptyLabel}</Text>;
    }
    return items.map((item) => (
      <View key={`${item.uid}-${item.handle || 'row'}`} style={styles.friendRow}>
        <View style={styles.friendInfo}>
          <Text style={styles.friendName}>{item.display_name || item.handle || 'Unnamed user'}</Text>
          {item.handle ? <Text style={styles.friendMeta}>@{item.handle}</Text> : null}
        </View>
        {rightAction ? rightAction(item) : null}
      </View>
    ));
  };

  const runFriendSearch = async () => {
    let trimmed = friendSearchInput.trim();
    if (trimmed.startsWith('@')) trimmed = trimmed.slice(1);
    if (!trimmed) {
      setSearchMessage('Enter a handle to search.');
      setSearchResult(null);
      return;
    }
    setSearching(true);
    setSearchMessage(null);
    setSearchResult(null);
    const result = await searchUserByHandle(trimmed);
    if (result?.uid) {
      setSearchResult(result);
    } else {
      setSearchMessage('No user found with that handle.');
    }
    setSearching(false);
  };

  const sendFriendRequest = async (handle) => {
    if (!handle) return;
    setFriendActionBusy(true);
    const resp = await requestFriend({ handle });
    if (resp?.success) {
      const status = resp?.status;
      const message = status === 'accepted'
        ? 'You are already friends.'
        : status === 'pending'
          ? 'Friend request sent.'
          : 'Request updated.';
      setSearchMessage(message);
      setSearchResult(null);
      setFriendSearchInput('');
      invalidateFriends();
    } else {
      Alert.alert('Friend Request', resp?.error || 'Failed to send friend request.');
    }
    setFriendActionBusy(false);
  };

  const acceptRequest = async (uid) => {
    if (!uid) return;
    setFriendActionBusy(true);
    const resp = await acceptFriendRequest(uid);
    if (resp?.success) {
      invalidateFriends();
    } else {
      Alert.alert('Friend Request', resp?.error || 'Failed to accept friend request.');
    }
    setFriendActionBusy(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.heroGlow} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: spacing['4xl'] + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing || friendsLoading || statsLoading} onRefresh={onRefresh} />}
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

        {/* Friends */}
        <TouchableOpacity onPress={() => router.push('/friends')} activeOpacity={0.85}>
          <View style={[formStyles.card, styles.friendsCard]}>
            <View style={styles.summaryRow}>
              <Text style={styles.sectionTitle}>Friends</Text>
              <View style={styles.summaryRight}>
                <Text style={styles.summaryCount}>{friends.length}</Text>
              </View>
            </View>
          <TextInput
            style={[formStyles.input, styles.searchInput]}
            placeholder="Search by handle"
            value={friendSearchInput}
            onChangeText={setFriendSearchInput}
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.primary}
            cursorColor={colors.text}
          />
          <View style={styles.friendActionRow}>
            <CTAButton
              title={searching ? 'Searching...' : 'Search'}
              onPress={runFriendSearch}
              style={styles.smallButton}
              textStyle={styles.smallButtonText}
              disabled={searching || !friendSearchInput.trim()}
            />
          </View>
          {searching ? (
            <View style={styles.centerRow}>
              <ActivityIndicator size="small" color={colors.text} />
            </View>
          ) : searchResult ? (
            <View style={styles.friendRow}>
              <View style={styles.friendInfo}>
                <Text style={styles.friendName}>{searchResult.display_name || searchResult.handle || 'Unnamed user'}</Text>
                {searchResult.handle ? <Text style={styles.friendMeta}>@{searchResult.handle}</Text> : null}
              </View>
              <CTAButton
                title="Add"
                onPress={() => sendFriendRequest(searchResult.handle)}
                style={styles.smallButton}
                textStyle={styles.smallButtonText}
                disabled={friendActionBusy}
              />
            </View>
          ) : searchMessage ? (
            <Text style={styles.emptyText}>{searchMessage}</Text>
          ) : null}

          <Text style={styles.subSectionTitle}>Recently Added</Text>
          {renderMiniList(recentFriends, 'No friends yet.')}
          </View>
        </TouchableOpacity>

        {/* Friend Requests */}
        <TouchableOpacity onPress={() => router.push('/friends')} activeOpacity={0.85}>
          <View style={[formStyles.card, styles.requestsCard]}>
            <View style={styles.summaryRow}>
              <Text style={styles.sectionTitle}>Friend Requests</Text>
              <View style={styles.summaryRight}>
                <Text style={styles.summaryCount}>{friendRequests.incoming.length + friendRequests.outgoing.length}</Text>
              </View>
            </View>
          <Text style={styles.subSectionTitle}>Incoming</Text>
          {renderMiniList(recentIncoming, 'No incoming requests.', (request) => (
            <CTAButton
              title="Accept"
              onPress={() => acceptRequest(request.uid)}
              style={styles.smallButton}
              textStyle={styles.smallButtonText}
              disabled={friendActionBusy}
            />
          ))}

          <Text style={styles.subSectionTitle}>Outgoing</Text>
          {renderMiniList(recentOutgoing, 'No outgoing requests.', () => (
            <Text style={styles.pendingText}>Pending</Text>
          ))}
          </View>
        </TouchableOpacity>

        {/* Actions */}
        <View style={styles.actions}>
          <CTAButton
            title="Edit Profile"
            onPress={() => router.push('/edit_profile')}
            variant="secondary"
          />

          {/* Sign Out button, theoretically. */}
          <View style={styles.actionRow}>
          <SecondaryButton
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
              style={styles.actionButton}
            />
            <CTAButton
              title="Delete Account"
              variant="secondary"
              style={[styles.actionButtonLast, styles.dangerButton]}
              textStyle={styles.dangerText}
              onPress={() => {
                Alert.alert(
                  'Delete Account',
                  'This will permanently delete your account. This cannot be undone.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: async () => {
                        try {
                          const resp = await deleteMyAccount();
                          if (resp?.success) {
                            await AsyncStorage.removeItem('user_token');
                            setUser(null);
                            console.log('Account deleted');
                          } else {
                            console.error('Delete failed:', resp?.error || 'Unknown');
                          }
                        } catch (e) {
                          console.error('Delete account error:', e);
                        }
                      } }
                  ]
                );
              }}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    heroGlow: {
      position: 'absolute',
      top: -140,
      right: -100,
      width: 260,
      height: 260,
      borderRadius: 130,
      backgroundColor: colors.primary,
      opacity: 0.07,
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
      fontSize: fontSizes.xl,
      fontWeight: '700',
      color: colors.text,
      fontFamily: 'SpaceMono',
      textAlign: 'center',
    },
    handleText: {
      color: colors.textMuted,
      marginTop: spacing.xs,
      textAlign: 'center',
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
    friendActionRow: {
      marginTop: spacing.sm,
      alignItems: 'flex-start',
    },
    friendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    friendInfo: {
      flex: 1,
      paddingRight: spacing.sm,
    },
    friendName: {
      color: colors.text,
      fontWeight: '600',
    },
    friendMeta: {
      color: colors.textMuted,
      fontSize: fontSizes.sm,
      marginTop: 2,
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
      fontSize: fontSizes.md,
      fontWeight: '600',
    },
    subSectionTitle: {
      marginTop: spacing.md,
      marginBottom: spacing.xs,
      fontSize: fontSizes.md,
      fontWeight: '600',
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
    smallButton: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    smallButtonText: {
      fontSize: fontSizes.sm,
    },
    pendingText: {
      color: colors.textMuted,
      fontSize: fontSizes.sm,
    },
    sectionTitle: {
      fontSize: fontSizes.lg,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.sm,
    },
    statsText: {
      color: colors.textMuted,
      lineHeight: 22,
    },
    actions: {
      marginTop: spacing.md,
    },
    actionRow: {
      flexDirection: 'row',
      marginTop: spacing.md,
    },
    actionButton: {
      flex: 1,
      marginRight: spacing.sm,
    },
    actionButtonLast: {
      flex: 1,
      marginRight: 0,
    },
    dangerButton: {
      borderColor: colors.danger,
    },
    dangerText: {
      color: colors.danger,
    },
  });
}
