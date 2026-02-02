import { StyleSheet, TextInput, TouchableOpacity, View, Text, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { Image } from 'expo-image';

import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../../hooks/AuthContext';
import { useFocusEffect } from '@react-navigation/native';

import {
  updateUserProfile,
  deleteMyAccount,
  fetchUserStats,
  setUserHandle,
  searchUserByHandle,
  requestFriend,
  acceptFriendRequest,
  fetchFriends,
  fetchFriendRequests
} from '@/lib/api';

import emptyPfp from '@/assets/images/empty_pfp.png';
import * as ImagePicker from 'expo-image-picker';
import storage from '@react-native-firebase/storage';
import auth from '@react-native-firebase/auth';
import { usePalette } from '@/hooks/usePalette';
import { CTAButton, SecondaryButton } from '@/components/ui/Buttons';
import { createFormStyles } from '@/components/ui/FormStyles';
import { spacing, fontSizes } from '@/theme/tokens';

export default function UserProfileScreen() {
  const { user, setUser, profile, setProfile } = useContext(AuthContext);
  const [editing, setEditing] = useState(false);
  const [formDisplayName, setFormDisplayName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [stats, setStats] = useState(null);
  const [handleInput, setHandleInput] = useState('');
  const [handleSaving, setHandleSaving] = useState(false);
  const [handleStatus, setHandleStatus] = useState(null);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState({ incoming: [], outgoing: [] });
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendSearchInput, setFriendSearchInput] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searchMessage, setSearchMessage] = useState(null);
  const [searching, setSearching] = useState(false);
  const [friendActionBusy, setFriendActionBusy] = useState(false);
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

  useEffect(() => {
    if (profile?.handle !== undefined) {
      setHandleInput(profile?.handle || '');
    }
  }, [profile?.handle]);

  const beginEdit = () => {
    setFormDisplayName(profile?.display_name || '');
    setEditing(true);
  };

  const loadStats = useCallback(() => {
    let isActive = true;
    async function run() {
      if (!user?.uid) {
        setStats(null);
        return;
      }
      const data = await fetchUserStats(user.uid);
      if (isActive) setStats(data);
    }
    run();
    return () => {
      isActive = false;
    };
  }, [user?.uid]);

  useFocusEffect(loadStats);

  const loadFriends = useCallback(() => {
    let isActive = true;
    async function run() {
      if (!user?.uid) {
        if (isActive) {
          setFriends([]);
          setFriendRequests({ incoming: [], outgoing: [] });
        }
        return;
      }
      setFriendsLoading(true);
      const [friendsData, requestsData] = await Promise.all([
        fetchFriends(),
        fetchFriendRequests()
      ]);
      if (isActive) {
        setFriends(Array.isArray(friendsData) ? friendsData : []);
        setFriendRequests(requestsData || { incoming: [], outgoing: [] });
        setFriendsLoading(false);
      }
    }
    run();
    return () => {
      isActive = false;
    };
  }, [user?.uid]);

  useFocusEffect(loadFriends);

  const saveEdits = async () => {
    if (!user?.uid) return;
    const updates = { display_name: formDisplayName };
    const updated = await updateUserProfile(user.uid, updates); // Actually save updates to backend
    if (updated) {
      setProfile(updated);
      setEditing(false);
    }
  };

  const saveHandle = async () => {
    if (!user?.uid) return;
    let trimmed = handleInput.trim();
    if (trimmed.startsWith('@')) trimmed = trimmed.slice(1);
    if (!trimmed) {
      setHandleStatus('Handle cannot be empty.');
      return;
    }
    setHandleSaving(true);
    setHandleStatus(null);
    const resp = await setUserHandle(trimmed);
    if (resp?.success) {
      setHandleInput(resp.handle || trimmed);
      setProfile((prev) => ({ ...prev, handle: resp.handle }));
      setHandleStatus('Handle saved.');
    } else {
      setHandleStatus(resp?.error || 'Failed to save handle.');
    }
    setHandleSaving(false);
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
      loadFriends();
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
      loadFriends();
    } else {
      Alert.alert('Friend Request', resp?.error || 'Failed to accept friend request.');
    }
    setFriendActionBusy(false);
  };

  async function uploadImageToStorage(uri) {
    // Minimal: no compression here; reuse your existing pattern from Upload tab
    const resp = await fetch(uri);
    const blob = await resp.blob();
    const safeName = uri.split('/').pop() || 'photo.jpg';
    const fileName = `profile_${user?.uid || 'anon'}_${Date.now()}_${safeName}`;
    const ref = storage().ref(`profile_photos/${fileName}`);
    await ref.put(blob);
    const downloadURL = await ref.getDownloadURL();
    return downloadURL;
  }

  const pickAndUploadPhoto = async () => {
    try {
      if (!user?.uid) return;
      // Ask for permission
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        console.warn('Media library permission not granted');
        return;
      }
      // Launch picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) return;
      setUploading(true);

      const url = await uploadImageToStorage(asset.uri);

      // Persist to your profile
      const updated = await updateUserProfile(user.uid, { photo_url: url });
      if (updated) setProfile(updated);
    } catch (e) {
      console.error('Profile photo upload failed:', e);
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.heroGlow} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Profile Header -- could have a different profile picture */}
        <View style={[formStyles.card, styles.headerCard]}>
          <TouchableOpacity onPress={pickAndUploadPhoto} disabled={uploading}>
            <View style={styles.profileImageWrap}>
              <Image
                source={profile?.photo_url ? { uri: profile.photo_url } : emptyPfp}
                style={styles.profileImage}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
              {uploading ? (
                <View style={styles.profileOverlay}>
                  <View style={styles.profileOverlayBackdrop} />
                  <View style={styles.profileOverlayContent}>
                    <ActivityIndicator size="small" color={colors.text} />
                    <Text style={styles.profileOverlayText}>Uploading...</Text>
                  </View>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
          {editing ? (
            <TextInput
              style={[formStyles.input, styles.nameInput]}
              placeholder={profile?.display_name || "Enter display name"}
              value={formDisplayName}
              onChangeText={setFormDisplayName}
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.primary}
              cursorColor={colors.text}
            />
          ) : (
            <Text style={styles.displayName}>{profile?.display_name || 'No Display Name set'}</Text>
          )}
          <Text style={styles.contactText}>{contactValue}</Text>
        </View>

        {/* Handle */}
        <View style={[formStyles.card, styles.handleCard]}>
          <Text style={styles.sectionTitle}>Handle</Text>
          <Text style={formStyles.helperText}>Set a unique handle for friends to find you.</Text>
          <View style={styles.handleRow}>
            <Text style={styles.handlePrefix}>@</Text>
            <TextInput
              style={[formStyles.input, styles.handleInput]}
              placeholder="your_handle"
              value={handleInput}
              onChangeText={setHandleInput}
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.primary}
              cursorColor={colors.text}
            />
          </View>
          <CTAButton
            title={handleSaving ? 'Saving...' : 'Save Handle'}
            onPress={saveHandle}
            style={styles.handleButton}
            disabled={handleSaving}
          />
          {handleStatus ? <Text style={styles.statusText}>{handleStatus}</Text> : null}
        </View>

        {/* Profile Details */}
        <View style={[formStyles.card, styles.statsCard]}>
          <Text style={styles.sectionTitle}>Stats</Text>
          <Text style={styles.statsText}>Pins posted: {stats?.pin_count ?? profile?.pin_count ?? 0}</Text>
          <Text style={styles.statsText}>Photos posted: {stats?.photo_count ?? profile?.photo_count ?? 0}</Text>
        </View>

        {/* Friends */}
        <View style={[formStyles.card, styles.friendsCard]}>
          <Text style={styles.sectionTitle}>Friends</Text>
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

          <Text style={styles.subSectionTitle}>Current Friends</Text>
          {friendsLoading ? (
            <View style={styles.centerRow}>
              <ActivityIndicator size="small" color={colors.text} />
            </View>
          ) : friends.length ? (
            friends.map((friend) => (
              <View key={`friend-${friend.uid}`} style={styles.friendRow}>
                <View style={styles.friendInfo}>
                  <Text style={styles.friendName}>{friend.display_name || friend.handle || 'Unnamed user'}</Text>
                  {friend.handle ? <Text style={styles.friendMeta}>@{friend.handle}</Text> : null}
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No friends yet.</Text>
          )}
        </View>

        {/* Friend Requests */}
        <View style={[formStyles.card, styles.requestsCard]}>
          <Text style={styles.sectionTitle}>Friend Requests</Text>
          <Text style={styles.subSectionTitle}>Incoming</Text>
          {friendsLoading ? (
            <View style={styles.centerRow}>
              <ActivityIndicator size="small" color={colors.text} />
            </View>
          ) : friendRequests.incoming.length ? (
            friendRequests.incoming.map((request) => (
              <View key={`incoming-${request.uid}`} style={styles.friendRow}>
                <View style={styles.friendInfo}>
                  <Text style={styles.friendName}>{request.display_name || request.handle || 'Unnamed user'}</Text>
                  {request.handle ? <Text style={styles.friendMeta}>@{request.handle}</Text> : null}
                </View>
                <CTAButton
                  title="Accept"
                  onPress={() => acceptRequest(request.uid)}
                  style={styles.smallButton}
                  textStyle={styles.smallButtonText}
                  disabled={friendActionBusy}
                />
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No incoming requests.</Text>
          )}

          <Text style={styles.subSectionTitle}>Outgoing</Text>
          {friendsLoading ? (
            <View style={styles.centerRow}>
              <ActivityIndicator size="small" color={colors.text} />
            </View>
          ) : friendRequests.outgoing.length ? (
            friendRequests.outgoing.map((request) => (
              <View key={`outgoing-${request.uid}`} style={styles.friendRow}>
                <View style={styles.friendInfo}>
                  <Text style={styles.friendName}>{request.display_name || request.handle || 'Unnamed user'}</Text>
                  {request.handle ? <Text style={styles.friendMeta}>@{request.handle}</Text> : null}
                </View>
                <Text style={styles.pendingText}>Pending</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No outgoing requests.</Text>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {editing ? (
            <>
              <View style={styles.actionRow}>
                <CTAButton
                  title="Save"
                  onPress={saveEdits}
                  variant="filled"
                  style={styles.actionButton}
                />
                <SecondaryButton
                  title="Cancel"
                  onPress={() => setEditing(false)}
                  style={styles.actionButtonLast}
                />
              </View>
            </>
          ) : (
            <CTAButton
              title="Edit Profile"
              onPress={beginEdit}
              variant="secondary"
            />
          )}

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
      paddingBottom: spacing['2xl'],
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
    profileOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    profileOverlayBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.bg,
      opacity: 0.75,
    },
    profileOverlayContent: {
      alignItems: 'center',
      gap: 6,
    },
    profileOverlayText: {
      color: colors.text,
      fontSize: fontSizes.sm,
      fontWeight: '600',
    },
    nameInput: {
      alignSelf: 'stretch',
      textAlign: 'center',
    },
    displayName: {
      fontSize: fontSizes.xl,
      fontWeight: '700',
      color: colors.text,
      fontFamily: 'SpaceMono',
      textAlign: 'center',
    },
    contactText: {
      color: colors.textMuted,
      marginTop: spacing.xs,
      textAlign: 'center',
    },
    statsCard: {
      marginBottom: spacing.lg,
    },
    handleCard: {
      marginBottom: spacing.lg,
    },
    handleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    handlePrefix: {
      color: colors.textMuted,
      fontSize: fontSizes.lg,
      marginRight: spacing.sm,
    },
    handleInput: {
      flex: 1,
    },
    handleButton: {
      marginTop: spacing.md,
    },
    statusText: {
      color: colors.textMuted,
      marginTop: spacing.sm,
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
