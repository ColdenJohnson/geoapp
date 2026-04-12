import { useContext } from 'react';

import { ThemeContext } from '@/hooks/ThemeContext';
import { normalizeThemePreference } from '@/theme/themePreference';

export function useColorScheme(): 'dark' | 'light' {
  const themePreference = useContext(ThemeContext);

  return normalizeThemePreference(themePreference);
}
