export const CHALLENGE_UPLOAD_DISTANCE_METERS = 80;

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
