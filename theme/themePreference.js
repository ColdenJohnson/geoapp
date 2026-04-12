export const DEFAULT_THEME_PREFERENCE = 'dark';
export const LIGHT_THEME_PREFERENCE = 'light';

export function normalizeThemePreference(value) {
  return value === LIGHT_THEME_PREFERENCE ? LIGHT_THEME_PREFERENCE : DEFAULT_THEME_PREFERENCE;
}

export function getThemePreferenceStorageKey(uid) {
  return `theme_preference_${uid}`;
}
