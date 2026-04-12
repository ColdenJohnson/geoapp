import { SectionList, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator, RefreshControl, Pressable } from 'react-native';
import { useCallback, useContext, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthContext } from '../hooks/AuthContext';
import { acceptFriendRequest, rejectFriendRequest, cancelFriendRequest } from '@/lib/api';
import { usePalette } from '@/hooks/usePalette';
import { createFormStyles } from '@/components/ui/FormStyles';
import { spacing } from '@/theme/tokens';
import { CTAButton } from '@/components/ui/Buttons';
import { textStyles } from '@/theme/typography';

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

  const openUserProfile = useCallback((uid) => {
    if (!uid) return;
    router.push({
      pathname: '/user_profile/[uid]',
      params: { uid },
    });
  }, [router]);

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
    const infoContent = (
      <View style={styles.rowInfo}>
        <Text style={styles.rowName}>{item.display_name || item.handle || 'Unnamed user'}</Text>
        {item.handle ? <Text style={styles.rowMeta}>@{item.handle}</Text> : null}
      </View>
    );

    return (
      <View style={styles.row}>
        {section.type === 'friends' ? (
          <Pressable
            onPress={() => openUserProfile(item.uid)}
            style={({ pressed }) => [styles.rowPressable, pressed && styles.rowPressablePressed]}
          >
            {infoContent}
          </Pressable>
        ) : (
          <Pressable
            onPress={() => openUserProfile(item.uid)}
            style={({ pressed }) => [styles.rowInfoPressable, pressed && styles.rowPressablePressed]}
          >
            {infoContent}
          </Pressable>
        )}
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
      ...textStyles.pageTitleCompact,
      color: colors.primary,
      letterSpacing: 0.4,
    },
    backText: {
      ...textStyles.bodyStrong,
      color: colors.primary,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    sectionTitle: {
      ...textStyles.sectionTitle,
      color: colors.text,
    },
    sectionCount: {
      ...textStyles.sectionTitleSm,
      color: colors.textMuted,
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
    rowPressable: {
      flex: 1,
    },
    rowInfoPressable: {
      flex: 1,
    },
    rowPressablePressed: {
      opacity: 0.72,
    },
    rowName: {
      ...textStyles.bodyStrong,
      color: colors.text,
    },
    rowMeta: {
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
      marginTop: 2,
    },
    miniActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    pendingText: {
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
    },
    smallButton: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    smallButtonText: {
      ...textStyles.buttonSmall,
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
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
    },
  });
}
