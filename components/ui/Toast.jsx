// components/ui/Toast.jsx
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Text, StyleSheet, Animated } from 'react-native';
import { spacing, radii, shadows, fontSizes } from '../../theme/tokens';
import { usePalette } from '@/hooks/usePalette';

export function Toast({ message, bottomOffset = 96 }) {
  const colors = usePalette();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) return;
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [message, anim]);

  if (!message) return null;
  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });
  return (
    <Animated.View
      style={[
        styles.toast,
        {
          bottom: bottomOffset,
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: anim,
          transform: [{ translateY }],
        },
      ]}
      pointerEvents="none"
    >
      <Text style={[styles.toastText, { color: colors.text }]}>{message}</Text>
    </Animated.View>
  );
}

export function useToast(defaultDuration = 2000) {
  const [message, setMessage] = useState(null);
  const timerRef = useRef(null);

  const hide = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setMessage(null);
  }, []);

  const show = useCallback(
    (msg, duration = defaultDuration) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setMessage(msg);
      timerRef.current = setTimeout(() => {
        setMessage(null);
        timerRef.current = null;
      }, duration);
    },
    [defaultDuration]
  );

  return { message, show, hide };
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignSelf: 'center',
    maxWidth: 420,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    alignItems: 'center',
    zIndex: 20,
    ...shadows.chip,
  },
  toastText: {
    fontSize: fontSizes.sm,
    fontWeight: '700',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
});
