import { SectionList, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator, RefreshControl } from 'react-native';
import { useCallback, useContext, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthContext } from '../hooks/AuthContext';
import { acceptFriendRequest, rejectFriendRequest, cancelFriendRequest } from '@/lib/api';
import { usePalette } from '@/hooks/usePalette';
import { createFormStyles } from '@/components/ui/FormStyles';
import { spacing, fontSizes } from '@/theme/tokens';
import { CTAButton } from '@/components/ui/Buttons';

export default function FriendsScreen() {
  const { friends, friendRequests, friendsLoading, refreshFriends, invalidateFriends } = useContext(AuthContext);
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const formStyles = useMemo(() => createFormStyles(colors), [colors]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshFriends({ force: true });
    setRefreshing(false);
  }, [refreshFriends]);

  const sections = useMemo(() => ([
    { title: 'Friends', data: friends, type: 'friends' },
    { title: 'Incoming Requests', data: friendRequests.incoming || [], type: 'incoming' },
    { title: 'Outgoing Requests', data: friendRequests.outgoing || [], type: 'outgoing' }
  ]), [friends, friendRequests.incoming, friendRequests.outgoing]);

  const onAccept = async (uid) => {
    if (!uid) return;
    setActionBusy(true);
    const resp = await acceptFriendRequest(uid);
    if (resp?.success) {
      invalidateFriends();
    }
    setActionBusy(false);
  };

  const onReject = async (uid) => {
    if (!uid) return;
    setActionBusy(true);
    const resp = await rejectFriendRequest(uid);
    if (resp?.success) {
      invalidateFriends();
    }
    setActionBusy(false);
  };

  const onCancel = async (uid) => {
    if (!uid) return;
    setActionBusy(true);
    const resp = await cancelFriendRequest(uid);
    if (resp?.success) {
      invalidateFriends();
    }
    setActionBusy(false);
  };

  const renderItem = ({ item, section }) => {
    if (!item?.uid) return null;
    return (
      <View style={styles.row}>
        <View style={styles.rowInfo}>
          <Text style={styles.rowName}>{item.display_name || item.handle || 'Unnamed user'}</Text>
          {item.handle ? <Text style={styles.rowMeta}>@{item.handle}</Text> : null}
        </View>
        {section.type === 'incoming' ? (
          <View style={styles.miniActionRow}>
            <CTAButton
              title="Accept"
              onPress={() => onAccept(item.uid)}
              style={styles.smallButton}
              textStyle={styles.smallButtonText}
              disabled={actionBusy}
            />
            <CTAButton
              title="Delete"
              onPress={() => onReject(item.uid)}
              style={styles.smallButton}
              textStyle={styles.smallButtonText}
              disabled={actionBusy}
            />
          </View>
        ) : section.type === 'outgoing' ? (
          <View style={styles.miniActionRow}>
            <Text style={styles.pendingText}>Pending</Text>
            <CTAButton
              title="Cancel"
              onPress={() => onCancel(item.uid)}
              style={styles.smallButton}
              textStyle={styles.smallButtonText}
              disabled={actionBusy}
            />
          </View>
        ) : null}
      </View>
    );
  };

  const renderSectionHeader = ({ section }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <Text style={styles.sectionCount}>{section.data.length}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => `${item.uid}-${item.handle || 'row'}`}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        ListHeaderComponent={(
          <View style={styles.header}>
            <Text style={styles.pageTitle}>Friends</Text>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={friendsLoading ? (
          <View style={styles.centerRow}>
            <ActivityIndicator size="small" color={colors.text} />
          </View>
        ) : (
          <View style={[formStyles.card, styles.emptyCard]}>
            <Text style={styles.emptyText}>No friends or requests yet.</Text>
          </View>
        )}
        contentContainerStyle={[
          styles.content,
          { paddingTop: spacing['2xl'] + insets.top, paddingBottom: spacing['2xl'] + insets.bottom }
        ]}
        refreshControl={<RefreshControl refreshing={refreshing || friendsLoading} onRefresh={onRefresh} />}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      paddingHorizontal: spacing.xl,
      width: '100%',
      maxWidth: 520,
      alignSelf: 'center',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    pageTitle: {
      fontSize: fontSizes.xl,
      fontWeight: '900',
      color: colors.primary,
      fontFamily: 'SpaceMono',
      letterSpacing: 0.4,
    },
    backText: {
      color: colors.primary,
      fontSize: fontSizes.md,
      fontWeight: '800',
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    sectionTitle: {
      fontSize: fontSizes.sm,
      fontWeight: '800',
      letterSpacing: 1.1,
      textTransform: 'uppercase',
      color: colors.text,
    },
    sectionCount: {
      color: colors.textMuted,
      fontSize: fontSizes.sm,
      fontWeight: '800',
      letterSpacing: 0.8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.md - 2,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowInfo: {
      flex: 1,
      paddingRight: spacing.sm,
    },
    rowName: {
      color: colors.text,
      fontWeight: '700',
    },
    rowMeta: {
      color: colors.textMuted,
      fontSize: fontSizes.sm,
      marginTop: 2,
      fontWeight: '700',
    },
    miniActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    pendingText: {
      color: colors.textMuted,
      fontSize: fontSizes.sm,
      fontWeight: '700',
    },
    smallButton: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    smallButtonText: {
      fontSize: fontSizes.sm,
    },
    centerRow: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.sm,
    },
    emptyCard: {
      marginTop: spacing.md,
    },
    emptyText: {
      color: colors.textMuted,
      fontWeight: '700',
    },
  });
}
