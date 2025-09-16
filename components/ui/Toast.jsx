// components/ui/Toast.jsx
import React, { useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { spacing, radii, shadows, fontSizes } from '../../theme/tokens';

export function Toast({ message, bottomOffset = 96 }) {
  if (!message) return null;
  return (
    <View style={[styles.toast, { bottom: bottomOffset }]} pointerEvents="none">
      <Text style={styles.toastText}>{message}</Text>
    </View>
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
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    zIndex: 20,
    ...shadows.chip,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: fontSizes.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
});