import { SafeAreaView, StyleSheet, TextInput, View, Text, Alert, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { AuthContext } from '@/hooks/AuthContext';
import {
  searchUserByHandle,
  requestFriend,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
} from '@/lib/api';
import { usePalette } from '@/hooks/usePalette';
import { CTAButton, SecondaryButton } from '@/components/ui/Buttons';
import { createFormStyles } from '@/components/ui/FormStyles';
import { spacing, fontSizes } from '@/theme/tokens';

export default function FriendsTabScreen() {
  const {
    friends,
    friendRequests,
    friendsLoading,
    refreshFriends,
    invalidateFriends,
  } = useContext(AuthContext);
  const [friendSearchInput, setFriendSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchMessage, setSearchMessage] = useState(null);
  const [searching, setSearching] = useState(false);
  const [friendActionBusy, setFriendActionBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const formStyles = useMemo(() => createFormStyles(colors), [colors]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshFriends({ force: true });
    setRefreshing(false);
  }, [refreshFriends]);

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

  const runFriendSearch = async (query, { showLoading = false, allowShort = false } = {}) => {
    let trimmed = typeof query === 'string' ? query.trim() : friendSearchInput.trim();
    if (trimmed.startsWith('@')) trimmed = trimmed.slice(1);
    if (!allowShort && trimmed.length < 3) {
      return;
    }
    if (showLoading) setSearching(true);
    setSearchMessage(null);
    const results = await searchUserByHandle(trimmed);
    if (results.length) {
      setSearchResults(results.slice(0, 3));
    } else {
      setSearchMessage('No users found.');
    }
    if (showLoading) setSearching(false);
  };

  useEffect(() => {
    const trimmed = friendSearchInput.trim();
    if (trimmed.length < 3) {
      return;
    }
    const timer = setTimeout(() => {
      runFriendSearch(trimmed, { showLoading: false, allowShort: false });
    }, 250);
    return () => clearTimeout(timer);
  }, [friendSearchInput]);

  const runFriendSearchImmediate = () => {
    let trimmed = friendSearchInput.trim();
    if (trimmed.startsWith('@')) trimmed = trimmed.slice(1);
    runFriendSearch(trimmed, { showLoading: true, allowShort: true });
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
      setSearchResults([]);
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

  const rejectRequest = async (uid) => {
    if (!uid) return;
    setFriendActionBusy(true);
    const resp = await rejectFriendRequest(uid);
    if (resp?.success) {
      invalidateFriends();
    } else {
      Alert.alert('Friend Request', resp?.error || 'Failed to delete friend request.');
    }
    setFriendActionBusy(false);
  };

  const cancelRequest = async (uid) => {
    if (!uid) return;
    setFriendActionBusy(true);
    const resp = await cancelFriendRequest(uid);
    if (resp?.success) {
      invalidateFriends();
    } else {
      Alert.alert('Friend Request', resp?.error || 'Failed to cancel friend request.');
    }
    setFriendActionBusy(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: spacing['4xl'] }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing || friendsLoading} onRefresh={onRefresh} />}
      >
        <Text style={styles.pageTitle}>Friends</Text>

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
            returnKeyType="search"
            onSubmitEditing={runFriendSearchImmediate}
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.primary}
            cursorColor={colors.text}
          />
          {searching ? (
            <View style={styles.centerRow}>
              <ActivityIndicator size="small" color={colors.text} />
            </View>
          ) : searchResults.length ? (
            searchResults.map((result) => (
              <View key={`search-${result.uid}`} style={styles.friendRow}>
                <View style={styles.friendInfo}>
                  <Text style={styles.friendName}>{result.display_name || result.handle || 'Unnamed user'}</Text>
                  {result.handle ? <Text style={styles.friendMeta}>@{result.handle}</Text> : null}
                </View>
                <CTAButton
                  title="Add"
                  onPress={() => sendFriendRequest(result.handle)}
                  style={styles.smallButton}
                  textStyle={styles.smallButtonText}
                  disabled={friendActionBusy}
                />
              </View>
            ))
          ) : searchMessage ? (
            <Text style={styles.emptyText}>{searchMessage}</Text>
          ) : null}

          <Text style={styles.subSectionTitle}>Recently Added</Text>
          {renderMiniList(recentFriends, 'No friends yet.')}
        </View>

        <View style={[formStyles.card, styles.requestsCard]}>
          <View style={styles.summaryRow}>
            <Text style={styles.sectionTitle}>Friend Requests</Text>
            <View style={styles.summaryRight}>
              <Text style={styles.summaryCount}>{friendRequests.incoming.length + friendRequests.outgoing.length}</Text>
            </View>
          </View>
          <Text style={styles.subSectionTitle}>Incoming</Text>
          {renderMiniList(recentIncoming, 'No incoming requests.', (request) => (
            <View style={styles.miniActionRow}>
              <CTAButton
                title="Accept"
                onPress={() => acceptRequest(request.uid)}
                style={styles.smallButton}
                textStyle={styles.smallButtonText}
                disabled={friendActionBusy}
              />
              <SecondaryButton
                title="Delete"
                onPress={() => rejectRequest(request.uid)}
                style={styles.smallButton}
                textStyle={styles.smallButtonText}
                disabled={friendActionBusy}
              />
            </View>
          ))}

          <Text style={styles.subSectionTitle}>Outgoing</Text>
          {renderMiniList(recentOutgoing, 'No outgoing requests.', (request) => (
            <View style={styles.miniActionRow}>
              <Text style={styles.pendingText}>Pending</Text>
              <SecondaryButton
                title="Cancel"
                onPress={() => cancelRequest(request.uid)}
                style={styles.smallButton}
                textStyle={styles.smallButtonText}
                disabled={friendActionBusy}
              />
            </View>
          ))}
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
    pageTitle: {
      fontSize: fontSizes['2xl'],
      fontWeight: '900',
      color: colors.primary,
      fontFamily: 'SpaceMono',
      letterSpacing: 0.3,
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
    smallButton: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    smallButtonText: {
      fontSize: fontSizes.sm,
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
    sectionTitle: {
      fontSize: fontSizes.lg,
      fontWeight: '900',
      letterSpacing: 0.4,
      color: colors.primary,
      marginBottom: spacing.sm,
    },
    centerRow: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.sm,
    },
    emptyText: {
      color: colors.textMuted,
      marginTop: spacing.sm,
    },
    pendingText: {
      color: colors.textMuted,
      fontSize: fontSizes.sm,
      fontWeight: '700',
    },
  });
}
