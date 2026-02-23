// components/ui/FormStyles.js
import { StyleSheet } from 'react-native';
import { spacing, radii, fontSizes, shadows } from '@/theme/tokens';

export function createFormStyles(colors) {
  return StyleSheet.create({
    input: {
      height: 52,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      backgroundColor: colors.bg,
      paddingHorizontal: spacing.md,
      fontSize: fontSizes.md,
      fontWeight: '600',
      color: colors.text,
    },
    inputDense: {
      height: 44,
    },
    card: {
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.lg,
      ...shadows.chip,
    },
    helperText: {
      color: colors.textMuted,
      fontSize: fontSizes.sm,
      lineHeight: 18,
    },
  });
}
