// theme/tokens.js
export const spacing = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 28,
};

export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 28,
  round: 999,
};

export const fontSizes = {
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  '2xl': 28,
};

// Shadow presets that render reasonably on iOS/Android
export const shadows = {
  bar: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: -2 },
    shadowRadius: 6,
    elevation: 6,
  },
  chip: {
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 3,
  },
};