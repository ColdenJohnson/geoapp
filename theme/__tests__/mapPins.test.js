import { getMapPinTheme } from '../mapPins';

const colors = {
  primary: '#EB0A46',
  primaryTextOn: '#FFFFFF',
  bg: '#FDFCFB',
  pinOutline: '#FFFFFF',
  pinLocation: '#EB0A46',
  pinOpen: '#FFE1D6',
};

describe('map pin themes', () => {
  it('uses the location theme for default photo pins', () => {
    const theme = getMapPinTheme('location', colors);

    expect(theme.id).toBe('location');
    expect(theme.shellColor).toBe(colors.pinLocation);
    expect(theme.glyphName).toBe('place');
    expect(theme.glyphColor).toBe(colors.primaryTextOn);
    expect(theme.outlineColor).toBe(colors.pinOutline);
  });

  it('uses the open theme for friend photo pins', () => {
    const theme = getMapPinTheme('open', colors);

    expect(theme.id).toBe('open');
    expect(theme.shellColor).toBe(colors.pinOpen);
    expect(theme.glyphName).toBe('public');
    expect(theme.outlineColor).toBe(colors.pinOutline);
  });

  it('falls back to the location theme for unknown theme ids', () => {
    const theme = getMapPinTheme('missing-theme', colors);

    expect(theme.id).toBe('location');
    expect(theme.shellColor).toBe(colors.pinLocation);
  });
});
