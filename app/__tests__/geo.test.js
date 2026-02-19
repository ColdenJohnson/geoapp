import {
  isInMainlandChina,
  wgs84ToGcj02,
  shouldConvertToGcj02,
} from '../../lib/geo';

describe('isInMainlandChina', () => {
  it('returns true for Shanghai', () => {
    expect(isInMainlandChina(31.2304, 121.4737)).toBe(true);
  });

  it('excludes Hong Kong', () => {
    expect(isInMainlandChina(22.3205, 114.1736)).toBe(false);
  });

  it('excludes Taiwan', () => {
    expect(isInMainlandChina(25.033, 121.5654)).toBe(false);
  });

  it('returns true for Xiamen', () => {
    expect(isInMainlandChina(24.495932, 118.163750)).toBe(true);
  });
});

describe('wgs84ToGcj02', () => {
  it('converts WGS84 to GCJ-02 inside mainland bounds', () => {
    const latitude = 31.417185872355034;
    const longitude = 120.896358;
    // Expected result calculated via lib/transform's wgs2gcj baseline.
    const expectedLatitude = 31.415041538289664;
    const expectedLongitude = 120.9005266479266;
    const result = wgs84ToGcj02(latitude, longitude);
    expect(result.latitude).toBeCloseTo(expectedLatitude, 5);
    expect(result.longitude).toBeCloseTo(expectedLongitude, 5);
  });

  it('returns original coordinates when outside mainland bounds', () => {
    const result = wgs84ToGcj02(37.7749, -122.4194);
    expect(result).toEqual({ latitude: 37.7749, longitude: -122.4194 });
  });
});

describe('shouldConvertToGcj02', () => {
  it('returns true only when both user and pin are in mainland', () => {
    const location = { coords: { latitude: 30.2741, longitude: 120.1551 } };
    const pin = { location: { latitude: 31.2304, longitude: 121.4737 } };
    expect(
      shouldConvertToGcj02(location, pin, {
        userIsInMainland: true,
        pinIsInMainland: true,
      })
    ).toBe(true);
  });

  it('returns false when either side is outside mainland', () => {
    const location = { coords: { latitude: 30.2741, longitude: 120.1551 } };
    const pin = { location: { latitude: 22.3205, longitude: 114.1736 } };
    expect(
      shouldConvertToGcj02(location, pin, {
        userIsInMainland: true,
        pinIsInMainland: false,
      })
    ).toBe(false);
  });
});
