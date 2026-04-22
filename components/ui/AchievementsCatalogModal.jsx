import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { getEarnedAchievementIds } from '@/lib/achievements';
import { useToast } from '@/components/ui/Toast';
import { radii, spacing } from '@/theme/tokens';
import { textStyles } from '@/theme/typography';

export function AchievementsCatalogModal({
  achievementCatalog,
  earnedAchievements,
  earnedBadgeIds,
  profileStyles,
  colors,
  visible,
  onClose,
  onPressAchievement,
}) {
  const badges = Array.isArray(achievementCatalog) ? achievementCatalog : [];
  const earnedIds = Array.isArray(earnedAchievements)
    ? getEarnedAchievementIds(earnedAchievements)
    : earnedBadgeIds;
  const earnedIdSet = new Set(Array.isArray(earnedIds) ? earnedIds : []);
  const earnedCount = badges.filter((badge) => earnedIdSet.has(badge.id)).length;
  const rowCount = Math.ceil(badges.length / 4);
  const shouldConstrainScroll = rowCount > 3;
  const { message: toastMessage, show: showToast } = useToast(2500);

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: colors.text }]}>All Achievements</Text>
            <View style={[styles.countPill, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <MaterialIcons name="emoji-events" size={14} color={colors.primary} />
              <Text style={[styles.countText, { color: colors.textMuted }]}>
                {earnedCount}/{badges.length}
              </Text>
            </View>
          </View>

          <Text style={[styles.helperText, { color: colors.textMuted }]}>Tap a badge to learn more.</Text>

          <ScrollView
            style={[styles.scroll, shouldConstrainScroll && styles.scrollConstrained]}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
            showsHorizontalScrollIndicator={false}
            horizontal={false}
          >
            <View style={profileStyles?.badgesGrid || styles.badgesGridFallback}>
              {badges.map((badge) => {
                const isEarned = earnedIdSet.has(badge.id);
                return (
                  <Pressable
                    key={badge.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${badge.label} achievement`}
                    onPress={() => {
                      onPressAchievement?.(badge, isEarned);
                      const description = typeof badge?.description === 'string' ? badge.description.trim() : '';
                      showToast(description || 'No description available yet.');
                    }}
                    style={({ pressed }) => [
                      profileStyles?.badgeItem || styles.badgeItemFallback,
                      pressed && styles.badgeItemPressed,
                    ]}
                  >
                    <View
                      style={[
                        profileStyles?.badgeIconWrap || styles.badgeIconWrapFallback,
                        {
                          backgroundColor: isEarned ? colors.badgeEarnedBg : colors.badgeLockedBg,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <MaterialIcons
                        name={badge.icon}
                        size={20}
                        color={isEarned ? colors.badgeEarnedIcon : colors.badgeLockedIcon}
                      />
                    </View>
                    <Text
                      style={[
                        profileStyles?.badgeLabel || styles.badgeLabelFallback,
                        { color: colors.textMuted },
                      ]}
                      numberOfLines={2}
                    >
                      {badge.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.doneButton,
              { backgroundColor: colors.primary },
              pressed && styles.doneButtonPressed,
            ]}
          >
            <Text style={[styles.doneButtonText, { color: colors.primaryTextOn }]}>Done</Text>
          </Pressable>

          {toastMessage ? (
            <View style={[styles.topToast, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.topToastText, { color: colors.text }]}>{toastMessage}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    backgroundColor: 'rgba(26, 26, 26, 0.42)',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '70%',
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    ...textStyles.heading,
    flexShrink: 1,
  },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.round,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  countText: {
    ...textStyles.chipSmall,
    letterSpacing: 0.3,
  },
  helperText: {
    ...textStyles.bodySmallStrong,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollConstrained: {
    maxHeight: 340,
  },
  scrollContent: {
    paddingBottom: spacing.sm,
  },
  badgesGridFallback: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
  badgeItemFallback: {
    width: '25%',
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.md,
    alignItems: 'center',
  },
  badgeItemPressed: {
    opacity: 0.84,
  },
  badgeIconWrapFallback: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  badgeLabelFallback: {
    ...textStyles.eyebrow,
    marginTop: spacing.xs,
    textAlign: 'center',
    letterSpacing: 0.7,
    lineHeight: 13,
  },
  doneButton: {
    marginTop: spacing.md,
    alignSelf: 'center',
    minWidth: 140,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.round,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  doneButtonPressed: {
    opacity: 0.84,
  },
  doneButtonText: {
    ...textStyles.button,
  },
  topToast: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  topToastText: {
    ...textStyles.bodySmallStrong,
    textAlign: 'center',
    letterSpacing: 0.4,
  },
});
