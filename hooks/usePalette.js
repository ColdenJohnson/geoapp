// Return the current color palette (light/dark) based on system color scheme.
import { useColorScheme } from 'react-native';
import { useMemo } from 'react';
import * as Palette from '@/theme/palette';

export function useIsDarkMode() {
  const scheme = useColorScheme();
  return scheme === 'dark';
}

export function usePalette() {
  const isDarkMode = useIsDarkMode();

  return useMemo(() => {
    if (isDarkMode) return Palette.dark;
    return Palette.light;
  }, [isDarkMode]);
}

export function getPalette(mode) {
  return mode === 'dark' ? Palette.dark : Palette.light;
}
