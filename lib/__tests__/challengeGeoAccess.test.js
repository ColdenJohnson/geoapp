import {
  normalizeChallengeCoordinate,
} from '../challengeGeoAccess';

describe('challenge coordinate helpers', () => {
  it('normalizes coordinates from location objects', () => {
    expect(normalizeChallengeCoordinate({
      location: {
        latitude: 40.0,
        longitude: -74.0,
      },
    })).toEqual({ latitude: 40.0, longitude: -74.0 });
  });

  it('normalizes coordinates from position objects', () => {
    expect(normalizeChallengeCoordinate({
      coords: {
        latitude: 40.0002,
        longitude: -74.0002,
      },
    })).toEqual({ latitude: 40.0002, longitude: -74.0002 });
  });

  it('returns null for unusable coordinates', () => {
    expect(normalizeChallengeCoordinate({ latitude: 'nope', longitude: -74 })).toBeNull();
  });
});
