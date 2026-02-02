// theme/palette.js
// Color palette for light and dark modes
// TODO: currently, no dark mode is set up. Need to enable. May entail creating an index.js in theme that somehow exports these vals..
export const light = {
  // brand
  primary: '#6247AA',
  primaryTextOn: '#FFFFFF',

  // text
  text: '#111111',
  textMuted: '#6B7280',

  // surfaces
  bg: '#FFFFFF',
  surface: '#F1FBFF',

  // lines / dividers
  border: '#E6E6E6',
  barBorder: '#E5E5EA',

  // feedback
  success: '#10B981',
  warning: '#F59E0B',
  danger:  '#EF4444',
};

export const dark = {
  primary: '#1DA1F2',
  primaryTextOn: '#0B0B0B',

  text: '#F5F5F5',
  textMuted: '#9CA3AF',

  bg: '#0B0B0B',
  surface: '#161616',

  border: '#2A2A2A',
  barBorder: '#1F1F1F',

  success: '#34D399',
  warning: '#FBBF24',
  danger:  '#F87171',
};