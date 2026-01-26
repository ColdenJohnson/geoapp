// Return the current color palette (light/dark) based on system color scheme.
import { useColorScheme } from 'react-native';
import { useMemo } from 'react';
import * as Palette from '@/theme/palette';

export function usePalette() {
  const scheme = useColorScheme();

  return useMemo(() => {
    if (scheme === 'dark') return Palette.dark;
    return Palette.light;
  }, [scheme]);
}

export function getPalette(mode) {
  return mode === 'dark' ? Palette.dark : Palette.light;
}
