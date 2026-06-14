const MAP_PIN_THEME_CONFIG = Object.freeze({
  location: {
    shellColorKey: 'pinLocation',
    glyphName: 'place',
    glyphColorKey: 'primaryTextOn',
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

export function getMapPinTheme(themeId, colors) {
  const normalizedThemeId = normalizeThemeId(themeId) || 'location';
  const config = MAP_PIN_THEME_CONFIG[normalizedThemeId] || MAP_PIN_THEME_CONFIG.location;

  return {
    id: normalizedThemeId,
    outlineColor: colors?.pinOutline || '#FFFFFF',
    shellColor: colors?.[config.shellColorKey] || colors?.primary || '#FF6B35',
    glyphName: config.glyphName,
    glyphColor: colors?.[config.glyphColorKey] || colors?.primaryTextOn || '#FFFFFF',
    badgeColor: colors?.[config.badgeColorKey] || colors?.bg || '#FFFFFF',
    badgeBorderColor: colors?.[config.badgeBorderColorKey]
      || colors?.[config.shellColorKey]
      || colors?.primary
      || '#FF6B35',
  };
}
