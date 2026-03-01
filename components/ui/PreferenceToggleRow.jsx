import { useMemo } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { usePalette } from '@/hooks/usePalette';
import { fontSizes, spacing } from '@/theme/tokens';

export function PreferenceToggleRow({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
  style,
}) {
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.row, style]}>
      <View style={styles.textWrap}>
        <Text style={styles.label}>{label}</Text>
        {typeof description === 'string' && description.trim() ? (
          <Text style={styles.description}>{description}</Text>
        ) : null}
      </View>
      <Switch
        value={!!value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={colors.bg}
      />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    textWrap: {
      flex: 1,
      gap: 2,
    },
    label: {
      color: colors.text,
      fontSize: fontSizes.md,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    description: {
      color: colors.textMuted,
      fontSize: fontSizes.sm,
      fontWeight: '700',
      lineHeight: 18,
    },
  });
}
