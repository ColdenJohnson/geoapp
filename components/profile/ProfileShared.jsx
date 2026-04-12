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
  subtitle = null,
  onPressAvatar = null,
  formStyles,
  styles,
}) {
  return (
    <View style={[formStyles.card, styles.headerCard]}>
      {onPressAvatar ? (
        <TouchableOpacity onPress={onPressAvatar} style={styles.profileImageWrap}>
          <Image
            source={profile?.photo_url ? { uri: profile.photo_url } : emptyPfp}
            style={styles.profileImage}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        </TouchableOpacity>
      ) : (
        <View style={styles.profileImageWrap}>
          <Image
            source={profile?.photo_url ? { uri: profile.photo_url } : emptyPfp}
            style={styles.profileImage}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        </View>
      )}
      <Text style={styles.displayName}>{profile?.display_name || 'No Display Name set'}</Text>
      <Text style={profile?.handle ? styles.handleText : styles.handlePlaceholder}>
        {profile?.handle ? `@${profile.handle}` : 'No handle set'}
      </Text>
      {subtitle ? <Text style={styles.contactText}>{subtitle}</Text> : null}
      {typeof profile?.bio === 'string' && profile.bio.trim() ? (
        <Text style={styles.bioText}>{profile.bio.trim()}</Text>
      ) : null}
    </View>
  );
}

export function ProfileAchievementsCard({
  earnedBadgeIds,
  colors,
  formStyles,
  styles,
}) {
  const earnedBadgeIdSet = new Set(Array.isArray(earnedBadgeIds) ? earnedBadgeIds : []);
  const earnedBadgeCount = PROFILE_BADGES.filter((badge) => earnedBadgeIdSet.has(badge.id)).length;

  return (
    <View style={[formStyles.card, styles.badgesCard]}>
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
  emptyLabel = 'No ranked photos yet.',
  formStyles,
  onPressPhoto,
  styles,
  topPhotos,
  topPhotosLoading,
}) {
  const displayedTopPhotos = Array.isArray(topPhotos) ? topPhotos.slice(0, 2) : [];

  return (
    <View style={[formStyles.card, styles.topPhotosCard]}>
      <Text style={styles.sectionTitle}>Top Elo Photos</Text>
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
                  Elo {Number.isFinite(photo?.global_elo) ? photo.global_elo : 1000}
                </Text>
              </View>
            </Pressable>
          ))}
          {displayedTopPhotos.length < 2 ? (
            <View style={[styles.topPhotoTile, styles.topPhotoPlaceholder]}>
              <Text style={styles.topPhotoPlaceholderText}>Waiting for more ranked photos</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function ProfileStatsCard({
  fallbackProfile = null,
  formStyles,
  friendCount = null,
  styles,
  stats,
}) {
  const resolvedFriendCount = Number.isFinite(friendCount)
    ? friendCount
    : Number.isFinite(stats?.friend_count)
      ? stats.friend_count
      : null;

  return (
    <View style={[formStyles.card, styles.statsCard]}>
      <Text style={styles.sectionTitle}>Stats</Text>
      {Number.isFinite(resolvedFriendCount) ? (
        <Text style={styles.statsText}>Friends: {resolvedFriendCount}</Text>
      ) : null}
      <Text style={styles.statsText}>Pins posted: {stats?.pin_count ?? fallbackProfile?.pin_count ?? 0}</Text>
      <Text style={styles.statsText}>Photos posted: {stats?.photo_count ?? fallbackProfile?.photo_count ?? 0}</Text>
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
      alignItems: 'center',
      marginBottom: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: spacing.lg,
    },
    profileImageWrap: {
      width: 108,
      height: 108,
      borderRadius: 54,
      marginBottom: spacing.md,
      overflow: 'hidden',
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
      textAlign: 'center',
    },
    handleText: {
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
      marginTop: spacing.xs,
      textAlign: 'center',
    },
    handlePlaceholder: {
      ...textStyles.italic,
      color: colors.textMuted,
      marginTop: spacing.xs,
      textAlign: 'center',
    },
    contactText: {
      ...textStyles.bodyXsStrong,
      color: colors.textMuted,
      marginTop: spacing.xs,
      textAlign: 'center',
    },
    bioText: {
      marginTop: spacing.sm,
      textAlign: 'center',
      color: colors.textMuted,
      ...textStyles.body,
      lineHeight: 20,
      maxWidth: 320,
      alignSelf: 'center',
    },
    shareRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      alignSelf: 'center',
      marginTop: -spacing.sm,
      marginBottom: spacing.lg,
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
      marginTop: -spacing.sm,
      marginBottom: spacing.lg,
      alignSelf: 'center',
      width: '100%',
      maxWidth: 320,
    },
    statsCard: {
      marginBottom: spacing.lg,
    },
    badgesCard: {
      marginBottom: spacing.lg,
    },
    topPhotosCard: {
      marginBottom: spacing.lg,
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
    sectionTitle: {
      ...textStyles.title,
      color: colors.primary,
      marginBottom: spacing.sm,
    },
    statsText: {
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
      lineHeight: 24,
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
    actions: {
      marginTop: spacing.md,
    },
    actionRow: {
      flexDirection: 'row',
      marginTop: spacing.md,
    },
    actionButtonLast: {
      flex: 1,
      marginRight: 0,
    },
  });
}

export function normalizeHandle(rawHandle) {
  if (typeof rawHandle !== 'string') return '';
  const trimmed = rawHandle.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
}
