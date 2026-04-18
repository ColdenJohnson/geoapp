import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { getAchievementDefinition } from '@/lib/achievements';
import { radii, spacing } from '@/theme/tokens';
import { textStyles } from '@/theme/typography';

export function AchievementCelebrationModal({
  achievement,
  colors,
  visible,
  onClose,
}) {
  const definition = getAchievementDefinition(achievement?.id);
  const achievementLabel = definition?.label || achievement?.id || 'Achievement';
  const achievementIcon = definition?.icon || 'emoji-events';

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
          <View style={[styles.badgeWrap, { backgroundColor: colors.primary }]}>
            <MaterialIcons name={achievementIcon} size={34} color={colors.primaryTextOn} />
          </View>
          <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Achievement unlocked</Text>
          <Text style={[styles.title, { color: colors.text }]}>{achievementLabel}</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            Nice work. Now back to Questing!
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.primary },
              pressed && styles.buttonPressed,
            ]}
            onPress={onClose}
          >
            <Text style={[styles.buttonText, { color: colors.primaryTextOn }]}>Sweet</Text>
          </Pressable>
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
    padding: spacing.xl,
    backgroundColor: 'rgba(26, 26, 26, 0.42)',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['2xl'],
    paddingBottom: spacing.xl,
  },
  badgeWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  eyebrow: {
    ...textStyles.eyebrow,
    marginBottom: spacing.xs,
  },
  title: {
    ...textStyles.heading,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    ...textStyles.body,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  button: {
    minWidth: 140,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.round,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  buttonPressed: {
    opacity: 0.84,
  },
  buttonText: {
    ...textStyles.button,
  },
});
