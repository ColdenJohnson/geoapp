// theme/tokens.js
export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  '2xl': 32,
  '4xl': 64,
};

export const radii = {
  sm: 10,
  md: 14,
  lg: 24,
  pill: 20,
  round: 999,
};

export const fontSizes = {
  sm: 13,
  md: 16,
  lg: 20,
  xl: 24,
  '2xl': 30,
};

// Shadow presets that render reasonably on iOS/Android
export const shadows = {
  bar: {
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: -8 },
    shadowRadius: 18,
    elevation: 10,
  },
  chip: {
    shadowColor: '#000',
    shadowOpacity: 0.11,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 7,
  },
};
