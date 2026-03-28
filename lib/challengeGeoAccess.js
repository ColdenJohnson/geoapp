import { getDistance } from 'geolib';

import geoChallengeConfig from './geoChallengeConfig.json';

const configuredUploadDistanceMeters = Number(geoChallengeConfig?.uploadDistanceMeters);

export const CHALLENGE_UPLOAD_DISTANCE_METERS = Number.isFinite(configuredUploadDistanceMeters)
  ? configuredUploadDistanceMeters
  : 80;

export function resolveChallengeUploadDistanceMeters(challenge) {
  const challengeDistanceMeters = Number(challenge?.upload_distance_meters);
  return Number.isFinite(challengeDistanceMeters)
    ? challengeDistanceMeters
    : CHALLENGE_UPLOAD_DISTANCE_METERS;
}

export function normalizeChallengeCoordinate(value) {
  const latitude = Number(
    value?.coords?.latitude ??
    value?.location?.latitude ??
    value?.latitude
  );
  const longitude = Number(
    value?.coords?.longitude ??
    value?.location?.longitude ??
    value?.longitude
  );

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

export function getDistanceToChallengeMeters(userLocation, challenge) {
  const userCoords = normalizeChallengeCoordinate(userLocation);
  const challengeCoords = normalizeChallengeCoordinate(challenge);
  if (!userCoords || !challengeCoords) {
    return null;
  }

  const distanceMeters = getDistance(userCoords, challengeCoords);
  return Number.isFinite(distanceMeters) ? distanceMeters : null;
}

export function canUploadToChallenge({ challenge, userLocation }) {
  if (!challenge) {
    return false;
  }
  if (challenge?.isGeoLocked === false) {
    return true;
  }

  const distanceMeters = getDistanceToChallengeMeters(userLocation, challenge);
  return distanceMeters !== null && distanceMeters <= resolveChallengeUploadDistanceMeters(challenge);
}

export function canViewChallenge({ challenge, userLocation, viewerUid }) {
  if (!challenge) {
    return false;
  }
  if (challenge?.isGeoLocked === false) {
    return true;
  }

  const createdByUid = typeof challenge?.created_by === 'string' ? challenge.created_by : '';
  if (viewerUid && createdByUid && createdByUid === viewerUid) {
    return true;
  }
  if (challenge?.viewer_has_uploaded === true) {
    return true;
  }

  return canUploadToChallenge({ challenge, userLocation });
}

export function getChallengeViewBlockedMessage({ challenge, userLocation, viewerUid }) {
  if (!challenge?.location) {
    return 'Location unavailable. Unable to open this challenge.';
  }
  if (canViewChallenge({ challenge, userLocation, viewerUid })) {
    return null;
  }

  const distanceMeters = getDistanceToChallengeMeters(userLocation, challenge);
  if (distanceMeters === null) {
    return 'Location unavailable. Unable to open this challenge.';
  }

  const uploadDistanceMeters = resolveChallengeUploadDistanceMeters(challenge);
  return `Not within ${uploadDistanceMeters}m of this challenge! Currently ${Math.round(distanceMeters)}m away.`;
}

export function getChallengeUploadBlockedMessage({ challenge, userLocation }) {
  if (!challenge?.location) {
    return 'Location unavailable. Unable to upload to this challenge.';
  }
  if (canUploadToChallenge({ challenge, userLocation })) {
    return null;
  }

  const distanceMeters = getDistanceToChallengeMeters(userLocation, challenge);
  if (distanceMeters === null) {
    return 'Location unavailable. Unable to upload to this challenge.';
  }

  const uploadDistanceMeters = resolveChallengeUploadDistanceMeters(challenge);
  return `Not within ${uploadDistanceMeters}m of this challenge! Currently ${Math.round(distanceMeters)}m away.`;
}
