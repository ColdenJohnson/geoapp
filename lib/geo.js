const MAINLAND_CHINA_BOUNDS = {
  minLat: 18.161, // Hainan south
  maxLat: 53.561, // Mohe north
  minLon: 73.499, // Xinjiang west
  maxLon: 135.086, // Heilongjiang east
};

const EXCLUSION_BOUNDS = [
  // Taiwan
  { minLat: 20.5, maxLat: 25.3, minLon: 119.4, maxLon: 123.5 },
  // Hong Kong
  { minLat: 22, maxLat: 23, minLon: 113.7, maxLon: 114.5 },
  // Macau
  { minLat: 22.05, maxLat: 22.3, minLon: 113.5, maxLon: 113.65 },
];

const PI = Math.PI;
const EARTH_RADIUS = 6378137.0;
const EE = 0.00669342162296594323;

function inBounds(lat, lon, bounds) {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    lat >= bounds.minLat &&
    lat <= bounds.maxLat &&
    lon >= bounds.minLon &&
    lon <= bounds.maxLon
  );
}

export function isInMainlandChina(lat, lon) {
  if (!inBounds(lat, lon, MAINLAND_CHINA_BOUNDS)) {
    return false;
  }
  return !EXCLUSION_BOUNDS.some((box) => inBounds(lat, lon, box));
}

function transformLat(x, y) {
  let ret =
    -100.0 +
    2.0 * x +
    3.0 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x));
  ret +=
    ((20.0 * Math.sin(6.0 * x * PI) +
      20.0 * Math.sin(2.0 * x * PI) +
      20.0 * Math.sin(y * PI) +
      40.0 * Math.sin((y / 3.0) * PI)) *
      2.0) /
    3.0;
  ret +=
    ((160.0 * Math.sin((y / 12.0) * PI) +
      320.0 * Math.sin((y * PI) / 30.0)) *
      2.0) /
    3.0;
  return ret;
}

function transformLon(x, y) {
  let ret =
    300.0 +
    x +
    2.0 * y +
    0.1 * x * x +
    0.1 * x * y +
    0.1 * Math.sqrt(Math.abs(x));
  ret +=
    ((20.0 * Math.sin(6.0 * x * PI) +
      20.0 * Math.sin(2.0 * x * PI) +
      20.0 * Math.sin(x * PI) +
      40.0 * Math.sin((x / 3.0) * PI)) *
      2.0) /
    3.0;
  ret +=
    ((150.0 * Math.sin((x / 12.0) * PI) +
      300.0 * Math.sin((x / 30.0) * PI)) *
      2.0) /
    3.0;
  return ret;
}

function extractCoordinates(subject) {
  if (!subject || typeof subject !== 'object') {
    return {};
  }
  if (
    typeof subject.latitude === 'number' &&
    typeof subject.longitude === 'number'
  ) {
    return {
      latitude: subject.latitude,
      longitude: subject.longitude,
    };
  }
  if (
    subject.coords &&
    typeof subject.coords.latitude === 'number' &&
    typeof subject.coords.longitude === 'number'
  ) {
    return {
      latitude: subject.coords.latitude,
      longitude: subject.coords.longitude,
    };
  }
  if (
    subject.location &&
    typeof subject.location.latitude === 'number' &&
    typeof subject.location.longitude === 'number'
  ) {
    return {
      latitude: subject.location.latitude,
      longitude: subject.location.longitude,
    };
  }
  return {};
}

export function wgs84ToGcj02(lat, lon) {
  if (!isFinite(lat) || !isFinite(lon) || !isInMainlandChina(lat, lon)) {
    return { latitude: lat, longitude: lon };
  }

  let dLat = transformLat(lon - 105.0, lat - 35.0);
  let dLon = transformLon(lon - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat =
    (dLat * 180.0) /
    (((EARTH_RADIUS * (1 - EE)) / (magic * sqrtMagic)) * PI);
  dLon =
    (dLon * 180.0) /
    ((EARTH_RADIUS / sqrtMagic) * Math.cos(radLat) * PI);
  const mgLat = lat + dLat;
  const mgLon = lon + dLon;

  return { latitude: mgLat, longitude: mgLon };
}

export function shouldConvertToGcj02(userLocation, pin, options = {}) {
  const { userIsInMainland, pinIsInMainland } = options;
  const userCoords = extractCoordinates(userLocation);
  const pinCoords = extractCoordinates(pin);

  const userInMainland =
    typeof userIsInMainland === 'boolean'
      ? userIsInMainland
      : isInMainlandChina(userCoords.latitude, userCoords.longitude);
  const pinInMainland =
    typeof pinIsInMainland === 'boolean'
      ? pinIsInMainland
      : typeof pin?.pinIsInMainland === 'boolean'
      ? pin.pinIsInMainland
      : isInMainlandChina(pinCoords.latitude, pinCoords.longitude);

  return Boolean(userInMainland && pinInMainland);
}
