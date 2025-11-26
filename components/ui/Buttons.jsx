// components/ui/CTAButton.jsx
// Call-to-action button (currently placed in bottombar container)
import React, { useMemo } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { usePalette } from '@/hooks/usePalette';
import { spacing, radii, fontSizes, shadows } from '@/theme/tokens';

export function CTAButton({ title, onPress, variant = 'primary', style, textStyle }) {
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : styles.secondary,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          variant === 'primary' ? styles.textPrimary : styles.textSecondary,
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
    pressed: { opacity: 0.9 },
    text: {
      fontSize: fontSizes.lg,
      fontWeight: '600',
      letterSpacing: 0.5,
    },
    textPrimary: { color: colors.primary },
    textSecondary: { color: colors.text },
  });
}
