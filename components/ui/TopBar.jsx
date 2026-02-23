

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { usePalette } from '@/hooks/usePalette';
import { spacing, fontSizes } from '@/theme/tokens';

export default function TopBar({ title, subtitle, right = null, style }) {
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.texts}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
      backgroundColor: colors.bg,
      borderBottomWidth: 1,
      borderBottomColor: colors.barBorder,
    },
    texts: {
      flex: 1,
      paddingRight: spacing.md,
    },
    title: {
      fontSize: fontSizes.lg,
      fontWeight: '800',
      letterSpacing: 0.4,
      color: colors.text,
    },
    subtitle: {
      fontSize: fontSizes.sm,
      fontWeight: '700',
      letterSpacing: 0.5,
      color: colors.textMuted,
    },
    right: {
      marginLeft: spacing.md,
    },
  });
}
