// theme/palette.js
// Color palette for light and dark modes
// TODO: currently, no dark mode is set up. Need to enable. May entail creating an index.js in theme that somehow exports these vals..
export const light = {
  // brand
  primary: '#EB0A46',
  primary_darkened: '#C4083A',
  primaryTextOn: '#FFFFFF',

  // map pins
  pinOutline: '#FFFFFF',
  pinLocation: '#e2460e',
  pinRestrictedOutline: '#661A00',
  pinOpen: '#FFE1D6',

  // text
  text: '#1A1A1A',
  textMuted: '#6E6963',

  // surfaces
  bg: '#FDFCFB',
  surface: '#FFF7F1',

  // lines / dividers
  border: '#E9DDD2',
  barBorder: '#EFDCCE',

  // feedback
  success: '#1F9D69',
  warning: '#D97706',
  danger:  '#DC2626',

  // profile badges
  badgeEarnedBg: '#EB0A46',
  badgeEarnedIcon: '#FFFFFF',
  badgeLockedBg: '#B8B2AC',
  badgeLockedIcon: '#FDFCFB',
};

export const dark = {
  primary: '#EB0A46',
  primary_darkened: '#C4083A',
  primaryTextOn: '#FFFFFF',

  // map pins
  pinOutline: '#F6EFE8',
  pinLocation: '#EB0A46',
  pinRestrictedOutline: '#575A4B',
  pinOpen: '#FFE1D6',

  text: '#F6EFE8',
  textMuted: '#F6EFE8',

  bg: '#1E1E1E',
  surface: '#121212',

  border: '#2C2C2C',
  barBorder: '#262626',

  success: '#34D399',
  warning: '#FBBF24',
  danger:  '#F87171',

  // profile badges
  badgeEarnedBg: '#EB0A46',
  badgeEarnedIcon: '#FFFFFF',
  badgeLockedBg: '#6D6258',
  badgeLockedIcon: '#F6EFE8',
};
