// theme/palette.js
// Color palette for light and dark modes
// TODO: currently, no dark mode is set up. Need to enable. May entail creating an index.js in theme that somehow exports these vals..
export const light = {
  // brand
  primary: '#FF6B35',
  primary_darkened: '#e2460e',
  primaryTextOn: '#FFFFFF',

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
};

export const dark = {
  primary: '#FF8A5C',
  primaryTextOn: '#1A100A',

  text: '#F6EFE8',
  textMuted: '#B7A89A',

  bg: '#15110E',
  surface: '#211A15',

  border: '#3A2F26',
  barBorder: '#2D241D',

  success: '#34D399',
  warning: '#FBBF24',
  danger:  '#F87171',
};
