// components/ui/CTAButton.jsx
// Call-to-action button (currently placed in bottombar container)
import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import * as Palette from '@/theme/palette';   // use light palette for now
import { spacing, radii, fontSizes, shadows } from '@/theme/tokens';

const colors = Palette.light; // defer dark mode until later

export function CTAButton({ title, onPress, variant = 'primary', style, textStyle }) {
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

const styles = StyleSheet.create({
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