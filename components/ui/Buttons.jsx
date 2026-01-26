// components/ui/CTAButton.jsx
// Call-to-action button (currently placed in bottombar container)
import React, { useMemo } from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { usePalette } from '@/hooks/usePalette';
import { spacing, radii, fontSizes, shadows } from '@/theme/tokens';

export function CTAButton({ title, onPress, variant = 'primary', style, textStyle }) {
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isFilled = variant === 'filled';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        isFilled ? styles.filled : variant === 'primary' ? styles.primary : styles.secondary,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          isFilled ? styles.textFilled : variant === 'primary' ? styles.textPrimary : styles.textSecondary,
          textStyle,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export function SecondaryButton(props) {
  return <CTAButton {...props} variant="secondary" />;
}

export function OutlineIconButton({ title, onPress, icon = null, style, textStyle }) {
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed, style]}
    >
      <View style={styles.outlineContent}>
        {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
        <Text style={[styles.outlineText, textStyle]}>{title}</Text>
      </View>
    </Pressable>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    base: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.lg + 2,
      borderRadius: radii.pill,
      borderWidth: 1,
      ...shadows.chip,
    },
    primary: {
      backgroundColor: colors.bg,
      borderColor: colors.border,
    },
    secondary: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    filled: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    pressed: { opacity: 0.9 },
    text: {
      fontSize: fontSizes.lg,
      fontWeight: '600',
      letterSpacing: 0.5,
    },
    textPrimary: { color: colors.primary },
    textSecondary: { color: colors.text },
    textFilled: { color: colors.primaryTextOn },
    outlineButton: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    outlineContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconWrap: {
      marginRight: spacing.sm,
    },
    outlineText: {
      fontSize: fontSizes.md,
      fontWeight: '600',
      color: colors.text,
    },
  });
}
