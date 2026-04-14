import { ActivityIndicator, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';

import emptyPfp from '@/assets/images/empty_pfp.png';
import { spacing } from '@/theme/tokens';
import { textStyles } from '@/theme/typography';

export const PROFILE_BADGES = [
  { id: 'photos_10', label: '10 Photos', icon: 'photo-camera' },
  { id: 'photos_100', label: '100 Photos', icon: 'collections' },
  { id: 'elo_1100', label: '1100 Elo', icon: 'emoji-events' },
  { id: 'elo_1200', label: '1200 Elo', icon: 'emoji-events' },
];

export function ProfileHeaderCard({
  profile,
  streak = null,
  onPressAvatar = null,
  styles,
}) {
  const AvatarWrapper = onPressAvatar ? TouchableOpacity : View;
  const avatarProps = onPressAvatar ? { onPress: onPressAvatar, accessibilityRole: 'button' } : {};
  const bio = typeof profile?.bio === 'string' ? profile.bio.trim() : '';
  const resolvedStreak = Number.isFinite(streak) ? Math.max(0, streak) : 0;

  return (
    <View style={styles.headerCard}>
      <View style={styles.identityRow}>
        <AvatarWrapper style={styles.profileImageWrap} {...avatarProps}>
          <Image
            source={profile?.photo_url ? { uri: profile.photo_url } : emptyPfp}
            style={styles.profileImage}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        </AvatarWrapper>
        <View style={styles.profileMeta}>
          <Text style={styles.displayName}>{profile?.display_name || 'No Display Name set'}</Text>
          <Text style={profile?.handle ? styles.handleText : styles.handlePlaceholder}>
            {profile?.handle ? `@${profile.handle}` : 'No handle set'}
          </Text>
          <View style={styles.streakRow} accessibilityLabel={`${resolvedStreak} day streak`}>
            <Text style={styles.streakEmoji}>🔥</Text>
            <Text style={styles.streakText}>
              <Text style={styles.streakNumber}>{resolvedStreak}</Text>
            </Text>
          </View>
        </View>
      </View>
      {bio ? <Text style={styles.bioText}>{bio}</Text> : null}
    </View>
  );
}

export function ProfileAchievementsCard({
  earnedBadgeIds,
  colors,
  styles,
}) {
  const earnedBadgeIdSet = new Set(Array.isArray(earnedBadgeIds) ? earnedBadgeIds : []);
  const earnedBadgeCount = PROFILE_BADGES.filter((badge) => earnedBadgeIdSet.has(badge.id)).length;

  return (
    <View style={styles.badgesCard}>
      <View style={styles.badgesHeaderRow}>
        <Text style={styles.sectionTitle}>Achievements</Text>
        <View style={styles.badgesCountPill}>
          <MaterialIcons name="emoji-events" size={14} color={colors.primary} />
          <Text style={styles.badgesCountText}>
            {earnedBadgeCount}/{PROFILE_BADGES.length}
          </Text>
        </View>
      </View>
      <View style={styles.badgesGrid}>
        {PROFILE_BADGES.map((badge) => {
          const isEarned = earnedBadgeIdSet.has(badge.id);
          return (
            <View key={badge.id} style={styles.badgeItem}>
              <View
                style={[
                  styles.badgeIconWrap,
                  {
                    backgroundColor: isEarned ? colors.badgeEarnedBg : colors.badgeLockedBg,
                  },
                ]}
              >
                <MaterialIcons
                  name={badge.icon}
                  size={20}
                  color={isEarned ? colors.badgeEarnedIcon : colors.badgeLockedIcon}
                />
              </View>
              <Text style={styles.badgeLabel}>{badge.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function ProfileTopPhotosCard({
  colors,
  emptyLabel = 'No top voted photos yet.',
  onPressPhoto,
  styles,
  topPhotos,
  topPhotosLoading,
}) {
  const displayedTopPhotos = Array.isArray(topPhotos) ? topPhotos.slice(0, 2) : [];

  return (
    <View style={styles.topPhotosCard}>
      <Text style={styles.sectionTitle}>Top Voted Photos</Text>
      {topPhotosLoading && displayedTopPhotos.length === 0 ? (
        <View style={styles.centerRow}>
          <ActivityIndicator size="small" color={colors.text} />
        </View>
      ) : null}
      {!topPhotosLoading && displayedTopPhotos.length === 0 ? (
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      ) : null}
      {displayedTopPhotos.length ? (
        <View style={styles.topPhotosGrid}>
          {displayedTopPhotos.map((photo, index) => (
            <Pressable
              key={photo?._id || `${index}`}
              style={styles.topPhotoTile}
              onPress={() => {
                if (!photo?.file_url) return;
                onPressPhoto?.(photo);
              }}
              disabled={!photo?.file_url}
            >
              <Image
                source={photo?.file_url ? { uri: photo.file_url } : undefined}
                style={styles.topPhotoImage}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
              <View style={styles.topPhotoRankBadge}>
                <Text style={styles.topPhotoRankText}>#{index + 1}</Text>
              </View>
              <View style={styles.topPhotoMeta}>
                <Text style={styles.topPhotoElo}>
                  Score {Number.isFinite(photo?.global_elo) ? photo.global_elo : 1000}
                </Text>
              </View>
            </Pressable>
          ))}
          {displayedTopPhotos.length < 2 ? (
            <View style={[styles.topPhotoTile, styles.topPhotoPlaceholder]}>
              <Text style={styles.topPhotoPlaceholderText}>Waiting for more top photos</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function ProfileStatsCard({
  fallbackProfile = null,
  friendCount = null,
  styles,
  stats,
}) {
  const resolvedFriendCount = Number.isFinite(friendCount)
    ? friendCount
    : Number.isFinite(stats?.friend_count)
      ? stats.friend_count
      : 0;
  const resolvedQuestCount = Number.isFinite(stats?.pin_count)
    ? stats.pin_count
    : Number.isFinite(fallbackProfile?.pin_count)
      ? fallbackProfile.pin_count
      : 0;
  const resolvedPhotoCount = Number.isFinite(stats?.photo_count)
    ? stats.photo_count
    : Number.isFinite(fallbackProfile?.photo_count)
      ? fallbackProfile.photo_count
      : 0;
  const statItems = [
    { key: 'friends', label: 'Friends', icon: 'people', value: resolvedFriendCount },
    { key: 'quests', label: 'Quests', icon: 'explore', value: resolvedQuestCount },
    { key: 'photos', label: 'Photos', icon: 'photo-camera', value: resolvedPhotoCount },
  ];

  return (
    <View style={styles.statsCard}>
      <View style={styles.statsRow}>
        {statItems.map((item, index) => (
          <View key={item.key} style={styles.statCluster}>
            {index > 0 ? <Text style={styles.statsSeparator}>•</Text> : null}
            <View style={styles.statItem} accessibilityLabel={`${item.value} ${item.label}`}>
              <MaterialIcons name={item.icon} size={14} style={styles.statIcon} />
              <Text style={styles.statNumber}>{item.value}</Text>
              <Text style={styles.statLabel}>{item.label}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function createProfileStyles(colors) {
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
      width: '100%',
      marginBottom: spacing.sm,
    },
    identityRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    profileMeta: {
      flex: 1,
      minWidth: 0,
    },
    profileImageWrap: {
      width: 108,
      height: 108,
      borderRadius: 54,
      marginRight: spacing.lg,
      overflow: 'hidden',
      backgroundColor: colors.bg,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 16,
      shadowOpacity: 0.12,
      elevation: 6,
    },
    profileImage: {
      width: '100%',
      height: '100%',
    },
    displayName: {
      ...textStyles.pageTitle,
      color: colors.primary,
      letterSpacing: 0.3,
      textAlign: 'left',
    },
    handleText: {
      ...textStyles.bodyEmphasis,
      color: colors.textMuted,
      marginTop: spacing.xs,
      textAlign: 'left',
    },
    handlePlaceholder: {
      ...textStyles.bodyEmphasis,
      fontStyle: 'italic',
      color: colors.textMuted,
      marginTop: spacing.xs,
      textAlign: 'left',
    },
    streakRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.xs,
    },
    streakEmoji: {
      ...textStyles.bodyEmphasis,
      marginRight: 6,
    },
    streakText: {
      ...textStyles.bodyEmphasis,
      color: colors.textMuted,
    },
    streakNumber: {
      ...textStyles.bodyStrong,
      color: colors.text,
    },
    bioText: {
      marginTop: spacing.lg,
      textAlign: 'left',
      color: colors.textMuted,
      ...textStyles.body,
      lineHeight: 22,
    },
    statsCard: {
      marginBottom: spacing.md,
    },
    statsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
    },
    statCluster: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    statItem: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    statIcon: {
      color: colors.textMuted,
      marginRight: 6,
    },
    statNumber: {
      ...textStyles.bodySmallStrong,
      color: colors.text,
      fontWeight: '700',
    },
    statLabel: {
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
      marginLeft: 4,
    },
    statsSeparator: {
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
      marginHorizontal: spacing.sm,
    },
    shareRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      alignSelf: 'flex-start',
      marginBottom: spacing.xl,
    },
    sharePressable: {
      minHeight: 40,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      minWidth: 168,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editIconPressable: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sharePressablePressed: {
      opacity: 0.9,
    },
    sharePressableText: {
      ...textStyles.buttonSmall,
      color: colors.primary,
      letterSpacing: 0.4,
    },
    profileActionRow: {
      width: '100%',
      marginBottom: spacing.xl,
    },
    badgesCard: {
      marginBottom: spacing.xl,
    },
    topPhotosCard: {
      marginBottom: spacing.xl,
    },
    emptyText: {
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
      marginTop: spacing.sm,
    },
    centerRow: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.sm,
    },
    sectionTitle: {
      ...textStyles.title,
      color: colors.primary,
      marginBottom: spacing.md,
    },
    badgesHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    badgesCountPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
    },
    badgesCountText: {
      ...textStyles.sectionTitleSm,
      color: colors.textMuted,
      letterSpacing: 0.8,
    },
    badgesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -spacing.xs,
      marginTop: spacing.xs,
    },
    badgeItem: {
      width: '25%',
      paddingHorizontal: spacing.xs,
      paddingTop: spacing.md,
      alignItems: 'center',
    },
    badgeIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    badgeLabel: {
      ...textStyles.eyebrow,
      marginTop: spacing.xs,
      color: colors.textMuted,
      textAlign: 'center',
      letterSpacing: 0.7,
      lineHeight: 13,
    },
    topPhotosGrid: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    topPhotoTile: {
      flex: 1,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      aspectRatio: 4 / 5,
    },
    topPhotoImage: {
      width: '100%',
      height: '100%',
    },
    topPhotoRankBadge: {
      position: 'absolute',
      top: spacing.sm,
      left: spacing.sm,
      backgroundColor: 'rgba(255,255,255,0.9)',
      borderRadius: 10,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
    },
    topPhotoRankText: {
      ...textStyles.chip,
      color: colors.primary,
    },
    topPhotoMeta: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(12, 7, 3, 0.55)',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    topPhotoElo: {
      ...textStyles.buttonSmall,
      color: '#FFFFFF',
      letterSpacing: 0.4,
      textAlign: 'center',
    },
    topPhotoPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
      borderStyle: 'dashed',
    },
    topPhotoPlaceholderText: {
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
      textAlign: 'center',
      paddingHorizontal: spacing.md,
    },
  });
}

export function normalizeHandle(rawHandle) {
  if (typeof rawHandle !== 'string') return '';
  const trimmed = rawHandle.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
}
