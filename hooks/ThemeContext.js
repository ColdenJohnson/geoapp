import { createContext } from 'react';

import { DEFAULT_THEME_PREFERENCE } from '@/theme/themePreference';

export const ThemeContext = createContext(DEFAULT_THEME_PREFERENCE);
