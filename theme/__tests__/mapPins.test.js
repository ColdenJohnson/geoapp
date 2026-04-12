import { resolveMapPinTheme, resolveMapPinThemeId } from '../mapPins';

const colors = {
  primary: '#EB0A46',
  primaryTextOn: '#FFFFFF',
  bg: '#FDFCFB',
  success: '#1F9D69',
  pinOutline: '#FFFFFF',
  pinLocation: '#EB0A46',
  pinRestrictedOutline: '#C4083A',
  pinOpen: '#FFE1D6',
};

function createPin(overrides = {}) {
  return {
    isGeoLocked: true,
    isPrivate: false,
    viewer_has_uploaded: false,
    ...overrides,
  };
}

describe('map pin themes', () => {
  it('uses a lock icon for out-of-range geolocked pins', () => {
    const theme = resolveMapPinTheme(createPin(), colors, { isWithinRange: false });

    expect(theme.id).toBe('location');
    expect(theme.shellColor).toBe(colors.pinLocation);
    expect(theme.glyphName).toBe('lock');
    expect(theme.outlineColor).toBe(colors.pinOutline);
  });

  it('uses an unlock icon for in-range friend pins', () => {
    const theme = resolveMapPinTheme(createPin(), colors, {
      isFriendPin: true,
      isWithinRange: true,
    });

    expect(theme.id).toBe('location');
    expect(theme.shellColor).toBe(colors.pinLocation);
    expect(theme.glyphName).toBe('lock-open');
    expect(theme.outlineColor).toBe(colors.pinRestrictedOutline);
  });

  it('uses an unlock icon for location pins that are already unlocked for the viewer', () => {
    const theme = resolveMapPinTheme(createPin(), colors, {
      isUnlocked: true,
    });

    expect(theme.id).toBe('location');
    expect(theme.glyphName).toBe('lock-open');
  });

  it('keeps open public pins on the default outline even when visited', () => {
    const theme = resolveMapPinTheme(createPin({
      isGeoLocked: false,
      viewer_has_uploaded: true,
    }), colors);

    expect(theme.id).toBe('open');
    expect(theme.shellColor).toBe(colors.pinOpen);
    expect(theme.glyphName).toBe('public');
    expect(theme.outlineColor).toBe(colors.pinOutline);
  });

  it('keeps private global pins on the open theme with the restricted outline', () => {
    const theme = resolveMapPinTheme(createPin({
      isPrivate: true,
      isGeoLocked: false,
    }), colors);

    expect(resolveMapPinThemeId(createPin({
      isPrivate: true,
      isGeoLocked: false,
    }))).toBe('open');
    expect(theme.glyphName).toBe('public');
    expect(theme.outlineColor).toBe(colors.pinRestrictedOutline);
  });
});
