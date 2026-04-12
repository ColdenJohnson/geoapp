import { Platform } from 'react-native';

const systemFont = Platform.select({
  ios: { fontFamily: 'System' },
  default: {},
});

function createTextStyle(style) {
  return {
    ...systemFont,
    ...style,
  };
}

export const textStyles = Object.freeze({
  navLabel: createTextStyle({
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  }),
  tabLabel: createTextStyle({
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  }),
  pageTitle: createTextStyle({
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '900',
    letterSpacing: 0.3,
  }),
  pageTitleCompact: createTextStyle({
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '900',
    letterSpacing: 0.4,
  }),
  brand: createTextStyle({
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '900',
    letterSpacing: 0.7,
  }),
  accentTitle: createTextStyle({
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '900',
    letterSpacing: 0.6,
  }),
  accentAction: createTextStyle({
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '800',
    letterSpacing: 0.9,
  }),
  headingLg: createTextStyle({
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '900',
    letterSpacing: -0.3,
  }),
  heading: createTextStyle({
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '900',
    letterSpacing: 0.3,
  }),
  title: createTextStyle({
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
    letterSpacing: 0.3,
  }),
  titleStrong: createTextStyle({
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
    letterSpacing: 0.2,
  }),
  body: createTextStyle({
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
  }),
  bodyEmphasis: createTextStyle({
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  }),
  bodyStrong: createTextStyle({
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
  }),
  bodySmall: createTextStyle({
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '400',
  }),
  bodySmallMedium: createTextStyle({
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  }),
  bodySmallStrong: createTextStyle({
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  }),
  bodySmallBold: createTextStyle({
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
  }),
  bodyXs: createTextStyle({
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  }),
  bodyXsStrong: createTextStyle({
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  }),
  bodyXsBold: createTextStyle({
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  }),
  body2xs: createTextStyle({
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  }),
  body2xsBold: createTextStyle({
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  }),
  body3xsBold: createTextStyle({
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  }),
  sectionTitle: createTextStyle({
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  }),
  sectionTitleSm: createTextStyle({
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  }),
  eyebrow: createTextStyle({
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  }),
  eyebrowTight: createTextStyle({
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  }),
  kicker: createTextStyle({
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 3.1,
    textTransform: 'uppercase',
  }),
  button: createTextStyle({
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.6,
  }),
  buttonSmall: createTextStyle({
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
  }),
  buttonCaps: createTextStyle({
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  }),
  buttonCapsSmall: createTextStyle({
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  }),
  chip: createTextStyle({
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  }),
  chipSmall: createTextStyle({
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
  }),
  input: createTextStyle({
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
  }),
  inputLarge: createTextStyle({
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '500',
  }),
  italic: createTextStyle({
    fontStyle: 'italic',
  }),
  italicStrong: createTextStyle({
    fontWeight: '600',
    fontStyle: 'italic',
  }),
  display: createTextStyle({
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '900',
    letterSpacing: 0.4,
  }),
  displayLarge: createTextStyle({
    fontSize: 44,
    lineHeight: 46,
    fontWeight: '900',
  }),
  countdown: createTextStyle({
    fontSize: 72,
    lineHeight: 72,
    fontWeight: '900',
  }),
});
