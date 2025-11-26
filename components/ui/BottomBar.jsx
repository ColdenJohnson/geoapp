// components/ui/BottomBar.jsx
// Bottom bar container
import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { usePalette } from '@/hooks/usePalette';
import { spacing, shadows } from '@/theme/tokens';

export default function BottomBar({ children, style }) {
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.bar, style]}>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    bar: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.barBorder,
      backgroundColor: colors.bg,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      zIndex: 10,
      ...shadows.bar,
    },
    inner: { maxWidth: 720, width: '100%', alignSelf: 'center' },
  });
}
