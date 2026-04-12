import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AuthContext } from '@/hooks/AuthContext';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  rejectFriendRequest,
  requestFriend,
  searchUserByHandle,
} from '@/lib/api';
import { buildViewPhotoChallengePhotoRoute, buildViewPhotoChallengeRoute } from '@/lib/navigation';
import { usePalette } from '@/hooks/usePalette';
import { CTAButton, SecondaryButton } from '@/components/ui/Buttons';
import { createFormStyles } from '@/components/ui/FormStyles';
import { Toast, useToast } from '@/components/ui/Toast';
import { radii, spacing } from '@/theme/tokens';
import { textStyles } from '@/theme/typography';

const FRIEND_ACTIVITY_PAGE_SIZE = 12;

function normalizeHandleQuery(value) {
  let trimmed = typeof value === 'string' ? value.trim() : '';
  if (trimmed.startsWith('@')) trimmed = trimmed.slice(1);
  return trimmed;
}

function parseDateMs(value) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function formatRelativeTime(value) {
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - parseDateMs(value)) / 1000));
  if (deltaSeconds < 45) return 'Just now';
  if (deltaSeconds < 3600) return `${Math.max(1, Math.floor(deltaSeconds / 60))}m ago`;
  if (deltaSeconds < 86400) return `${Math.max(1, Math.floor(deltaSeconds / 3600))}h ago`;
  if (deltaSeconds < 604800) return `${Math.max(1, Math.floor(deltaSeconds / 86400))}d ago`;
  return `${Math.max(1, Math.floor(deltaSeconds / 604800))}w ago`;
}

function getDisplayLabel(item) {
  return item?.display_name || item?.actor_display_name || item?.handle || item?.actor_handle || 'Unnamed user';
}

function getHandleLabel(item) {
  const handle = item?.handle || item?.actor_handle || null;
  return handle ? `@${String(handle).replace(/^@/, '')}` : null;
}

function getAvatarInitial(item) {
  const label = getDisplayLabel(item);
  return typeof label === 'string' && label ? label.charAt(0).toUpperCase() : 'A';
}

function getActivityLabel(item) {
  if (item?.type === 'challenge_created') return ' created a Quest';
  if (item?.type === 'challenge_participated') return ' joined a Quest';
  if (item?.type === 'your_photo_comment') return ' commented on your photo';
  return ' commented';
}

function UserAvatar({ uri, label, size, styles }) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[
          styles.avatarImage,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
    );
  }

  return (
    <View
      style={[
        styles.avatarFallback,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={styles.avatarFallbackText}>{label}</Text>
    </View>
  );
}

export default function FriendsTabScreen() {
  const {
    friends,
    friendRequests,
    friendsLoading,
    refreshFriends,
    refreshFriendRequests,
    friendActivityItems: activityItems,
    friendActivitySuggestions: activitySuggestions,
    friendActivityLoading: activityLoading,
    friendActivityLoadingMore: activityLoadingMore,
    friendActivityFetchedAt,
    refreshFriendActivity,
    loadMoreFriendActivity,
  } = useContext(AuthContext);
  const { handle: sharedHandleParam } = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState('activity');
  const [friendSearchInput, setFriendSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchMessage, setSearchMessage] = useState(null);
  const [searching, setSearching] = useState(false);
  const [friendActionBusy, setFriendActionBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingSuggestionRequests, setPendingSuggestionRequests] = useState({});
  const router = useRouter();
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const formStyles = useMemo(() => createFormStyles(colors), [colors]);
  const { message: toastMessage, show: showToast } = useToast(2500);
  const prefilledHandleRef = useRef('');
  const activityHasScrolledRef = useRef(false);
  const sharedHandle = useMemo(
    () => (Array.isArray(sharedHandleParam) ? sharedHandleParam[0] : sharedHandleParam),
    [sharedHandleParam]
  );

  const pendingIncoming = useMemo(() => (
    [...(friendRequests.incoming || [])].sort((a, b) => parseDateMs(b?.requested_at) - parseDateMs(a?.requested_at))
  ), [friendRequests.incoming]);

  const pendingOutgoing = useMemo(() => (
    [...(friendRequests.outgoing || [])].sort((a, b) => parseDateMs(b?.requested_at) - parseDateMs(a?.requested_at))
  ), [friendRequests.outgoing]);

  const recentFriends = useMemo(() => (
    [...friends]
      .sort((a, b) => parseDateMs(b?.accepted_at) - parseDateMs(a?.accepted_at))
      .slice(0, 2)
  ), [friends]);

  const currentFriends = useMemo(() => (
    [...friends].sort((a, b) => getDisplayLabel(a).localeCompare(getDisplayLabel(b)))
  ), [friends]);

  const activityFeedData = useMemo(() => {
    const baseRows = activityItems.map((item) => ({
      key: item.id,
      rowType: 'activity',
      item,
    }));
    const shouldInsertSuggestions = !activityLoading && (baseRows.length > 0 || activitySuggestions.length > 0);

    if (!shouldInsertSuggestions) {
      return baseRows;
    }

    const insertionIndex = Math.min(FRIEND_ACTIVITY_PAGE_SIZE, baseRows.length);
    const suggestionRow = { key: 'activity-suggestions', rowType: 'suggestions' };

    if (baseRows.length === 0) {
      return [suggestionRow];
    }

    return [
      ...baseRows.slice(0, insertionIndex),
      suggestionRow,
      ...baseRows.slice(insertionIndex),
    ];
  }, [activityItems, activityLoading, activitySuggestions]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    activityHasScrolledRef.current = false;
    await Promise.all([
      refreshFriends({ force: true }),
      refreshFriendRequests({ force: true }),
      refreshFriendActivity({ force: true, showLoading: false }),
    ]);
    setPendingSuggestionRequests({});
    setRefreshing(false);
  }, [refreshFriendActivity, refreshFriendRequests, refreshFriends]);

  useFocusEffect(
    useCallback(() => {
      refreshFriendRequests({ force: false });
      refreshFriendActivity({
        force: false,
        showLoading: !friendActivityFetchedAt && !activityItems.length && !activitySuggestions.length,
      });
    }, [activityItems.length, activitySuggestions.length, friendActivityFetchedAt, refreshFriendActivity, refreshFriendRequests])
  );

  const openUserProfile = useCallback((uid) => {
    if (!uid) return;
    router.push({
      pathname: '/user_profile/[uid]',
      params: { uid },
    });
  }, [router]);

  const openChallenge = useCallback((item) => {
    if (!item?.pin_id) return;
    if (!item?.can_open) {
      if (item?.challenge_is_geo_locked) {
        showToast('Unable to open this activity because it is location locked.', 2500);
      }
      return;
    }
    if (item?.comment_text && item?.photo_id) {
      router.push(buildViewPhotoChallengeRoute({
        pinId: item.pin_id,
        message: item.challenge_prompt || '',
        createdByHandle: item.challenge_created_by_handle || '',
      }));
      router.push(buildViewPhotoChallengePhotoRoute({
        pinId: item.pin_id,
        photoId: item.photo_id,
      }));
      return;
    }
    router.push(buildViewPhotoChallengeRoute({
      pinId: item.pin_id,
      message: item.challenge_prompt || '',
      createdByHandle: item.challenge_created_by_handle || '',
    }));
  }, [router, showToast]);

  const runFriendSearch = useCallback(async (query, { showLoading = false, allowShort = false } = {}) => {
    const trimmed = normalizeHandleQuery(query ?? friendSearchInput);
    if (!allowShort && trimmed.length < 3) {
      setSearchResults([]);
      setSearchMessage(null);
      return;
    }
    if (!trimmed) {
      setSearchResults([]);
      setSearchMessage(null);
      return;
    }

    if (showLoading) setSearching(true);
    setSearchMessage(null);
    const results = await searchUserByHandle(trimmed);
    if (results.length) {
      setSearchResults(results.slice(0, 3));
    } else {
      setSearchResults([]);
      setSearchMessage('No users found.');
    }
    if (showLoading) setSearching(false);
  }, [friendSearchInput]);

  useEffect(() => {
    const trimmed = normalizeHandleQuery(friendSearchInput);
    if (trimmed.length < 3) {
      setSearchResults([]);
      setSearchMessage(null);
      return;
    }
    const timer = setTimeout(() => {
      runFriendSearch(trimmed, { showLoading: false });
    }, 250);
    return () => clearTimeout(timer);
  }, [friendSearchInput, runFriendSearch]);

  useEffect(() => {
    const normalized = normalizeHandleQuery(sharedHandle);
    if (!normalized || normalized === prefilledHandleRef.current) return;
    prefilledHandleRef.current = normalized;
    setFriendSearchInput(normalized);
    runFriendSearch(normalized, { showLoading: true, allowShort: true });
  }, [runFriendSearch, sharedHandle]);

  const runFriendSearchImmediate = useCallback(() => {
    runFriendSearch(friendSearchInput, { showLoading: true, allowShort: true });
  }, [friendSearchInput, runFriendSearch]);

  const sendFriendRequest = useCallback(async ({ handle, targetUid, clearSearch = false } = {}) => {
    if (!handle && !targetUid) return;
    setFriendActionBusy(true);
    const resp = await requestFriend({ handle, target_uid: targetUid });
    if (resp?.success) {
      if (targetUid) {
        setPendingSuggestionRequests((prev) => ({ ...prev, [targetUid]: true }));
      }
      setSearchMessage(
        resp?.status === 'pending' ? 'Friend request sent.' : 'Request updated.'
      );
      await refreshFriendRequests({ force: true });
      if (clearSearch) {
        setSearchResults([]);
        setFriendSearchInput('');
      }
    } else {
      if (targetUid) {
        setPendingSuggestionRequests((prev) => {
          const next = { ...prev };
          delete next[targetUid];
          return next;
        });
      }
      Alert.alert('Friend Request', resp?.error || 'Failed to send friend request.');
    }
    setFriendActionBusy(false);
  }, [refreshFriendRequests]);

  const acceptRequest = useCallback(async (uid) => {
    if (!uid) return;
    setFriendActionBusy(true);
    const resp = await acceptFriendRequest(uid);
    if (resp?.success) {
      activityHasScrolledRef.current = false;
      await Promise.all([
        refreshFriends({ force: true }),
        refreshFriendActivity({ force: true, showLoading: false }),
      ]);
    } else {
      Alert.alert('Friend Request', resp?.error || 'Failed to accept friend request.');
    }
    setFriendActionBusy(false);
  }, [refreshFriendActivity, refreshFriends]);

  const rejectRequest = useCallback(async (uid) => {
    if (!uid) return;
    setFriendActionBusy(true);
    const resp = await rejectFriendRequest(uid);
    if (!resp?.success) {
      Alert.alert('Friend Request', resp?.error || 'Failed to delete friend request.');
    }
    setFriendActionBusy(false);
  }, []);

  const cancelRequest = useCallback(async (uid) => {
    if (!uid) return;
    setFriendActionBusy(true);
    const resp = await cancelFriendRequest(uid);
    if (!resp?.success) {
      Alert.alert('Friend Request', resp?.error || 'Failed to cancel friend request.');
    }
    setFriendActionBusy(false);
  }, []);

  const renderUserRow = useCallback((item, {
    keyPrefix,
    rightAction = null,
    metaText = null,
    rowMuted = false,
  } = {}) => {
    if (!item?.uid) return null;
    const handleLabel = getHandleLabel(item);
    const secondaryMeta = metaText || null;

    return (
      <View key={`${keyPrefix}-${item.uid}-${item.handle || 'row'}`} style={[styles.personRow, rowMuted && styles.personRowMuted]}>
        <Pressable
          onPress={() => openUserProfile(item.uid)}
          style={({ pressed }) => [styles.personPressable, pressed && styles.pressed]}
        >
          <View style={styles.personContent}>
            <UserAvatar
              uri={item.photo_url || null}
              label={getAvatarInitial(item)}
              size={46}
              styles={styles}
            />
            <View style={styles.personTextWrap}>
              <Text style={styles.personName}>{getDisplayLabel(item)}</Text>
              {handleLabel ? <Text style={styles.personMeta}>{handleLabel}</Text> : null}
              {secondaryMeta ? <Text style={styles.personMetaSecondary}>{secondaryMeta}</Text> : null}
            </View>
          </View>
        </Pressable>
        {rightAction ? <View style={styles.personAction}>{rightAction(item)}</View> : null}
      </View>
    );
  }, [openUserProfile, styles]);

  const renderRequestSection = useCallback((title, items, type) => (
    <View style={[formStyles.card, styles.sectionCard]}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{items.length}</Text>
      </View>
      {friendsLoading && !items.length ? (
        <View style={styles.centerRow}>
          <ActivityIndicator size="small" color={colors.text} />
        </View>
      ) : !items.length ? (
        <Text style={styles.emptyText}>
          {type === 'incoming' ? 'No incoming requests.' : 'No outgoing requests.'}
        </Text>
      ) : (
        items.map((item) => renderUserRow(item, {
          keyPrefix: title,
          rowMuted: type === 'outgoing',
          metaText: type === 'incoming' ? formatRelativeTime(item?.requested_at) : `Pending ${formatRelativeTime(item?.requested_at)}`,
          rightAction: type === 'incoming'
            ? (request) => (
                <View style={styles.inlineActionRow}>
                  <CTAButton
                    title="Accept"
                    onPress={() => acceptRequest(request.uid)}
                    variant="filled"
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
              )
            : (request) => (
                <SecondaryButton
                  title="Cancel"
                  onPress={() => cancelRequest(request.uid)}
                  style={styles.smallButton}
                  textStyle={styles.smallButtonText}
                  disabled={friendActionBusy}
                />
              ),
        }))
      )}
    </View>
  ), [
    acceptRequest,
    cancelRequest,
    colors.text,
    formStyles.card,
    friendActionBusy,
    friendsLoading,
    rejectRequest,
    renderUserRow,
    styles,
  ]);

  const renderTopChrome = useCallback(() => (
    <>
      <Text style={styles.pageTitle}>Friends</Text>

      <View style={styles.segmentedControl}>
        <Pressable
          onPress={() => setActiveTab('activity')}
          style={({ pressed }) => [
            styles.segmentButton,
            activeTab === 'activity' && styles.segmentButtonActive,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.segmentText, activeTab === 'activity' && styles.segmentTextActive]}>Activity</Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('requests')}
          style={({ pressed }) => [
            styles.segmentButton,
            activeTab === 'requests' && styles.segmentButtonActive,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.segmentText, activeTab === 'requests' && styles.segmentTextActive]}>Friends</Text>
          {pendingIncoming.length > 0 ? <View style={styles.segmentBadge} /> : null}
        </Pressable>
      </View>
    </>
  ), [activeTab, pendingIncoming.length, styles]);

  const renderSearchSection = useCallback(() => (
    <View style={[formStyles.card, styles.sectionCard]}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Search</Text>
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
        <View style={styles.stackSection}>
          {searchResults.map((result) => renderUserRow(result, {
            keyPrefix: 'search',
            rightAction: (user) => (
              <CTAButton
                title="Add"
                onPress={() => sendFriendRequest({ handle: user.handle, clearSearch: true })}
                variant="filled"
                style={styles.smallButton}
                textStyle={styles.smallButtonText}
                disabled={friendActionBusy}
              />
            ),
          }))}
        </View>
      ) : searchMessage ? (
        <Text style={styles.emptyText}>{searchMessage}</Text>
      ) : null}
    </View>
  ), [
    colors.primary,
    colors.text,
    colors.textMuted,
    formStyles.card,
    formStyles.input,
    friendActionBusy,
    friendSearchInput,
    renderUserRow,
    runFriendSearchImmediate,
    searchMessage,
    searchResults,
    searching,
    sendFriendRequest,
    styles,
  ]);

  const activityListHeader = useMemo(() => (
    <View>
      {renderTopChrome()}
      {renderSearchSection()}

      {renderRequestSection('Pending Requests', pendingIncoming, 'incoming')}

      <View style={styles.sectionHeaderStandalone}>
        <Text style={styles.sectionTitle}>Friend Activity</Text>
        <Text style={styles.sectionCount}>{activityItems.length}</Text>
      </View>
    </View>
  ), [
    activityItems.length,
    pendingIncoming,
    renderRequestSection,
    renderSearchSection,
    renderTopChrome,
    styles,
  ]);

  const renderActivityRow = useCallback(({ item: row }) => {
    if (row?.rowType === 'suggestions') {
      return (
        <View style={[formStyles.card, styles.sectionCard]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Suggested For You</Text>
            <Text style={styles.sectionCount}>{activitySuggestions.length}</Text>
          </View>
          {!activitySuggestions.length ? (
            <Text style={styles.emptyText}>No suggestions right now.</Text>
          ) : (
            activitySuggestions.map((item) => {
              const requestPending = !!pendingSuggestionRequests[item?.uid]
                || pendingOutgoing.some((request) => request?.uid === item?.uid);
              return renderUserRow(item, {
                keyPrefix: 'suggestion',
                rowMuted: requestPending,
                metaText: item?.mutual_count ? `${item.mutual_count} mutual ${item.mutual_count === 1 ? 'friend' : 'friends'}` : null,
                rightAction: (suggestion) => {
                  if (requestPending) {
                    return (
                      <CTAButton
                        title="Request Pending"
                        variant="secondary"
                        style={styles.smallButton}
                        textStyle={styles.smallButtonText}
                        disabled={true}
                      />
                    );
                  }

                  return (
                    <CTAButton
                      title="Add"
                      onPress={() => sendFriendRequest({ targetUid: suggestion.uid })}
                      variant="filled"
                      style={styles.smallButton}
                      textStyle={styles.smallButtonText}
                      disabled={friendActionBusy}
                    />
                  );
                },
              });
            })
          )}
        </View>
      );
    }

    const item = row?.item;
    const handleLabel = getHandleLabel({ handle: item?.actor_handle });
    const showQuestPhoto = !item?.comment_text && !!item?.challenge_photo_url;

    return (
      <View style={styles.activityCard}>
        <View style={styles.activityHeader}>
          <Pressable
            onPress={() => openUserProfile(item?.actor_uid)}
            style={({ pressed }) => [styles.activityUserPressable, pressed && styles.pressed]}
          >
            <UserAvatar
              uri={item?.actor_photo_url || null}
              label={getAvatarInitial({ display_name: item?.actor_display_name, handle: item?.actor_handle })}
              size={42}
              styles={styles}
            />
            <View style={styles.activityHeaderText}>
              <Text style={styles.activityHeadline}>
                <Text style={styles.activityHeadlineName}>{item?.actor_display_name || handleLabel || 'Someone'}</Text>
                {getActivityLabel(item)}
              </Text>
              <Text style={styles.activityTimestamp}>{formatRelativeTime(item?.created_at)}</Text>
            </View>
          </Pressable>
        </View>

        <Pressable
          disabled={!item?.pin_id}
          onPress={() => openChallenge(item)}
          style={({ pressed }) => [
            styles.activityBody,
            !item?.can_open && styles.activityBodyStatic,
            item?.pin_id && pressed && styles.pressed,
          ]}
        >
          <Text style={styles.activityPrompt}>{item?.challenge_prompt}</Text>
          {item?.comment_text ? <Text style={styles.activityComment}>"{item.comment_text}"</Text> : null}
          {showQuestPhoto ? (
            <Image
              source={{ uri: item.challenge_photo_url }}
              style={styles.activityImage}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : null}
        </Pressable>
      </View>
    );
  }, [
    activitySuggestions,
    formStyles.card,
    friendActionBusy,
    openChallenge,
    openUserProfile,
    pendingOutgoing,
    pendingSuggestionRequests,
    renderUserRow,
    sendFriendRequest,
    styles,
  ]);

  const renderActivityEmpty = useCallback(() => {
    if (activityLoading) {
      return (
        <View style={styles.centerRowTall}>
          <ActivityIndicator size="small" color={colors.text} />
        </View>
      );
    }

    return (
      <View style={[formStyles.card, styles.sectionCard]}>
        <Text style={styles.emptyText}>No recent activity yet.</Text>
      </View>
    );
  }, [activityLoading, colors.text, formStyles.card, styles]);

  const renderActivityListFooter = useCallback(() => (
    <View style={styles.activityFooter}>
      {activityLoadingMore ? (
        <View style={styles.centerRow}>
          <ActivityIndicator size="small" color={colors.text} />
        </View>
      ) : null}
    </View>
  ), [activityLoadingMore, colors.text, styles]);

  const onActivityEndReached = useCallback(() => {
    if (!activityHasScrolledRef.current) return;
    loadMoreFriendActivity();
  }, [loadMoreFriendActivity]);

  const renderRequestsContent = () => (
    <>
      {renderSearchSection()}
      {renderRequestSection('Incoming Requests', pendingIncoming, 'incoming')}
      {renderRequestSection('Outgoing Requests', pendingOutgoing, 'outgoing')}

      <View style={[formStyles.card, styles.sectionCard]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recently Added</Text>
          <Text style={styles.sectionCount}>{recentFriends.length}</Text>
        </View>
        {friendsLoading && !recentFriends.length ? (
          <View style={styles.centerRow}>
            <ActivityIndicator size="small" color={colors.text} />
          </View>
        ) : !recentFriends.length ? (
          <Text style={styles.emptyText}>No friends yet.</Text>
        ) : (
          recentFriends.map((item) => renderUserRow(item, {
            keyPrefix: 'recent',
            metaText: formatRelativeTime(item?.accepted_at),
          }))
        )}
      </View>

      <View style={[formStyles.card, styles.sectionCard]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Current Friends</Text>
          <Text style={styles.sectionCount}>{currentFriends.length}</Text>
        </View>
        {friendsLoading && !currentFriends.length ? (
          <View style={styles.centerRow}>
            <ActivityIndicator size="small" color={colors.text} />
          </View>
        ) : !currentFriends.length ? (
          <Text style={styles.emptyText}>No friends yet.</Text>
        ) : (
          currentFriends.map((item) => renderUserRow(item, { keyPrefix: 'friend' }))
        )}
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {activeTab === 'activity' ? (
          <FlatList
            data={activityFeedData}
            keyExtractor={(item) => item.key}
            renderItem={renderActivityRow}
            ListHeaderComponent={activityListHeader}
            ListEmptyComponent={renderActivityEmpty}
            ListFooterComponent={renderActivityListFooter}
            contentContainerStyle={[styles.content, { paddingBottom: spacing['4xl'] }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            refreshControl={<RefreshControl refreshing={refreshing || friendsLoading} onRefresh={onRefresh} />}
            onEndReached={onActivityEndReached}
            onEndReachedThreshold={0.45}
            onScrollBeginDrag={() => {
              activityHasScrolledRef.current = true;
            }}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={5}
            removeClippedSubviews={Platform.OS === 'android'}
          />
        ) : (
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: spacing['4xl'] }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            refreshControl={<RefreshControl refreshing={refreshing || friendsLoading} onRefresh={onRefresh} />}
          >
            {renderTopChrome()}
            {renderRequestsContent()}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
      <Toast message={toastMessage} bottomOffset={spacing.xl} />
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    keyboardWrap: {
      flex: 1,
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
      ...textStyles.pageTitle,
      color: colors.primary,
      letterSpacing: 0.3,
      marginBottom: spacing.lg,
    },
    segmentedControl: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 4,
      borderRadius: radii.lg,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.lg,
    },
    segmentButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    segmentButtonActive: {
      backgroundColor: colors.surface,
    },
    segmentText: {
      ...textStyles.sectionTitleSm,
      color: colors.textMuted,
      letterSpacing: 0.9,
    },
    segmentTextActive: {
      color: colors.primary,
    },
    segmentBadge: {
      position: 'absolute',
      top: 8,
      right: 22,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    sectionCard: {
      marginBottom: spacing.lg,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    sectionHeaderStandalone: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
      paddingHorizontal: 2,
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
    searchInput: {
      marginTop: 2,
    },
    stackSection: {
      marginTop: spacing.sm,
    },
    personRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.md - 2,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: spacing.md,
    },
    personRowMuted: {
      opacity: 0.7,
    },
    personPressable: {
      flex: 1,
    },
    personContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    personTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    personName: {
      ...textStyles.bodyStrong,
      color: colors.text,
    },
    personMeta: {
      ...textStyles.bodySmallStrong,
      color: colors.primary,
      marginTop: 3,
    },
    personMetaSecondary: {
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
      marginTop: 3,
    },
    personAction: {
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    inlineActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    smallButton: {
      minHeight: 40,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    smallButtonText: {
      ...textStyles.buttonSmall,
    },
    activityCard: {
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    activityHeader: {
      marginBottom: spacing.md,
    },
    activityUserPressable: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    activityHeaderText: {
      flex: 1,
      minWidth: 0,
    },
    activityHeadline: {
      ...textStyles.bodyStrong,
      color: colors.text,
      lineHeight: 21,
    },
    activityHeadlineName: {
      ...textStyles.bodyStrong,
      color: colors.primary,
    },
    activityTimestamp: {
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
      marginTop: 4,
    },
    activityBody: {
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      padding: spacing.md,
    },
    activityBodyStatic: {
      opacity: 0.92,
    },
    activityPrompt: {
      ...textStyles.bodyStrong,
      color: colors.text,
      lineHeight: 22,
    },
    activityComment: {
      ...textStyles.italicStrong,
      color: colors.text,
      lineHeight: 22,
      marginTop: spacing.sm,
    },
    activityImage: {
      width: '100%',
      aspectRatio: 3 / 4,
      borderRadius: radii.md,
      marginTop: spacing.md,
      backgroundColor: colors.border,
    },
    activityLink: {
      marginTop: spacing.sm,
      color: colors.primary,
      ...textStyles.buttonSmall,
      letterSpacing: 0.5,
    },
    activityFooter: {
      marginTop: spacing.xs,
    },
    avatarImage: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    avatarFallback: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    avatarFallbackText: {
      ...textStyles.bodyStrong,
      color: colors.primaryTextOn,
    },
    centerRow: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.sm,
    },
    centerRowTall: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing['2xl'],
    },
    emptyText: {
      color: colors.textMuted,
      marginTop: spacing.xs,
      lineHeight: 20,
    },
    pressed: {
      opacity: 0.78,
    },
  });
}
