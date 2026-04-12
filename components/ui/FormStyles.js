// components/ui/FormStyles.js
import { StyleSheet } from 'react-native';
import { spacing, radii, shadows } from '@/theme/tokens';
import { textStyles } from '@/theme/typography';

export function createFormStyles(colors) {
  return StyleSheet.create({
    input: {
      height: 52,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      backgroundColor: colors.bg,
      paddingHorizontal: spacing.md,
      ...textStyles.input,
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
      ...textStyles.bodySmall,
      color: colors.textMuted,
      lineHeight: 18,
    },
  });
}
