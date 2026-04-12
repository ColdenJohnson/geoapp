// Return the current color palette (light/dark) based on the app theme preference.
import { useMemo } from 'react';

import { useColorScheme } from '@/hooks/useColorScheme';
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
