// components/ui/BottomBar.jsx
// Bottom bar container
import React from 'react';
import { View, StyleSheet } from 'react-native';
import * as Palette from '@/theme/palette';
import { spacing, shadows } from '@/theme/tokens';

const colors = Palette.light; // defer dark mode

export default function BottomBar({ children, style }) {
  return (
    <View style={[styles.bar, style]}>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
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