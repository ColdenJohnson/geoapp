const MAP_PIN_THEME_CONFIG = Object.freeze({
  location: {
    shellColorKey: 'pinLocation',
    badgeColorKey: 'bg',
  },
  open: {
    shellColorKey: 'pinOpen',
    glyphName: 'public',
    glyphColorKey: 'primary',
    badgeColorKey: 'bg',
    badgeBorderColorKey: 'primary',
  },
});

function normalizeThemeId(themeId) {
  if (typeof themeId !== 'string') {
    return null;
  }

  const normalized = themeId.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (MAP_PIN_THEME_CONFIG[normalized]) {
    return normalized;
  }

  return null;
}

export function resolveMapPinThemeId(pin, { isFriendPin = false } = {}) {
  if (pin?.isGeoLocked !== false) {
    return 'location';
  }

  return 'open';
}

export function getMapPinTheme(themeId, colors, options = {}) {
  const normalizedThemeId = normalizeThemeId(themeId) || 'location';
  const config = MAP_PIN_THEME_CONFIG[normalizedThemeId] || MAP_PIN_THEME_CONFIG.location;
  const usesRestrictedOutline = options?.usesRestrictedOutline === true;
  const showsUnlockedGlyph = options?.isUnlocked === true || options?.isWithinRange === true;
  const isLocationTheme = normalizedThemeId === 'location';
  const glyphName = isLocationTheme
    ? (showsUnlockedGlyph ? 'lock-open' : 'lock')
    : config.glyphName;
  const glyphColorKey = isLocationTheme ? 'primaryTextOn' : config.glyphColorKey;
  const outlineColorKey = usesRestrictedOutline ? 'pinRestrictedOutline' : 'pinOutline';

  return {
    id: normalizedThemeId,
    outlineColor: colors?.[outlineColorKey] || colors?.success || colors?.pinOutline || '#FFFFFF',
    shellColor: colors?.[config.shellColorKey] || colors?.primary || '#FF6B35',
    glyphName,
    glyphColor: colors?.[glyphColorKey] || colors?.primaryTextOn || '#FFFFFF',
    badgeColor: colors?.[config.badgeColorKey] || colors?.bg || '#FFFFFF',
    badgeBorderColor: colors?.[config.badgeBorderColorKey]
      || colors?.[config.shellColorKey]
      || colors?.primary
      || '#FF6B35',
  };
}

export function resolveMapPinTheme(pin, colors, options = {}) {
  const themeId = resolveMapPinThemeId(pin, options);

  return getMapPinTheme(themeId, colors, {
    usesRestrictedOutline: pin?.isPrivate === true || options?.isFriendPin === true,
    isUnlocked: options?.isUnlocked === true,
    isWithinRange: options?.isWithinRange === true,
  });
}

export const mapPinThemeIds = Object.freeze(Object.keys(MAP_PIN_THEME_CONFIG));
