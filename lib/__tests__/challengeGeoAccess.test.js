import {
  CHALLENGE_UPLOAD_DISTANCE_METERS,
  canUploadToChallenge,
  canViewChallenge,
  getChallengeUploadBlockedMessage,
  getChallengeViewBlockedMessage,
} from '../challengeGeoAccess';

function createChallenge(overrides = {}) {
  return {
    isGeoLocked: true,
    created_by: 'creator-1',
    viewer_has_uploaded: false,
    location: {
      latitude: 40.0,
      longitude: -74.0,
    },
    ...overrides,
  };
}

describe('challenge geo access helpers', () => {
  it('lets previously unlocked viewers keep opening a geo challenge from anywhere', () => {
    const challenge = createChallenge({ viewer_has_uploaded: true });
    const farAwayViewer = {
      coords: {
        latitude: 40.01,
        longitude: -74.01,
      },
    };

    expect(canViewChallenge({
      challenge,
      userLocation: farAwayViewer,
      viewerUid: 'viewer-2',
    })).toBe(true);
    expect(getChallengeViewBlockedMessage({
      challenge,
      userLocation: farAwayViewer,
      viewerUid: 'viewer-2',
    })).toBeNull();
  });

  it('still blocks uploads for previously unlocked viewers who are out of range', () => {
    const challenge = createChallenge({ viewer_has_uploaded: true });
    const farAwayViewer = {
      coords: {
        latitude: 40.01,
        longitude: -74.01,
      },
    };

    expect(canUploadToChallenge({
      challenge,
      userLocation: farAwayViewer,
    })).toBe(false);
    expect(getChallengeUploadBlockedMessage({
      challenge,
      userLocation: farAwayViewer,
    })).toMatch(
      new RegExp(`^Not within ${CHALLENGE_UPLOAD_DISTANCE_METERS}m of this challenge! Currently \\d+m away\\.$`)
    );
  });

  it('keeps creators subject to the same upload distance restriction', () => {
    const challenge = createChallenge();
    const farAwayCreator = {
      coords: {
        latitude: 40.01,
        longitude: -74.01,
      },
    };

    expect(canViewChallenge({
      challenge,
      userLocation: farAwayCreator,
      viewerUid: 'creator-1',
    })).toBe(true);
    expect(getChallengeUploadBlockedMessage({
      challenge,
      userLocation: farAwayCreator,
    })).toMatch(
      new RegExp(`^Not within ${CHALLENGE_UPLOAD_DISTANCE_METERS}m of this challenge! Currently \\d+m away\\.$`)
    );
  });

  it('allows uploads when the viewer is within the shared threshold', () => {
    const challenge = createChallenge();
    const nearbyViewer = {
      coords: {
        latitude: 40.0002,
        longitude: -74.0002,
      },
    };

    expect(canUploadToChallenge({
      challenge,
      userLocation: nearbyViewer,
    })).toBe(true);
    expect(getChallengeUploadBlockedMessage({
      challenge,
      userLocation: nearbyViewer,
    })).toBeNull();
  });
});
