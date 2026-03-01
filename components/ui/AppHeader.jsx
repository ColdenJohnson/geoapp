import React, { useMemo } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette } from '@/hooks/usePalette';
import { fontSizes, spacing } from '@/theme/tokens';

export default function AppHeader({
  title = null,
  subtitle = null,
  onBack = null,
  backText = null,
  right = null,
  transparent = false,
  style,
}) {
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.container, transparent && styles.transparent, style]}>
      <View style={styles.topRow}>
        <Pressable
          onPress={onBack}
          hitSlop={8}
          disabled={!onBack}
          style={[styles.backButton, !onBack && styles.backButtonDisabled]}
        >
          <MaterialIcons name="arrow-back" size={20} color={colors.text} />
          {backText ? <Text style={styles.backText}>{backText}</Text> : null}
        </Pressable>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
      {title ? (
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
      ) : null}
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
      backgroundColor: colors.bg,
      borderBottomWidth: 1,
      borderBottomColor: colors.barBorder,
    },
    transparent: {
      backgroundColor: 'transparent',
      borderBottomWidth: 0,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.xs,
      paddingRight: spacing.sm,
      alignSelf: 'flex-start',
    },
    backButtonDisabled: {
      opacity: 0.4,
    },
    backText: {
      fontSize: fontSizes.sm,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    right: {
      marginLeft: spacing.md,
    },
    title: {
      marginTop: spacing.xs,
      fontSize: fontSizes.lg,
      fontWeight: '900',
      color: colors.primary,
      letterSpacing: 0.4,
      fontFamily: 'SpaceMono',
    },
    subtitle: {
      marginTop: spacing.xs,
      fontSize: 11,
      color: colors.textMuted,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
  });
}
