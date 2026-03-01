import AsyncStorage from '@react-native-async-storage/async-storage';

export const PIN_PHOTOS_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
export const PIN_META_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const pinPhotosMemoryCache = new Map();
const pinMetaMemoryCache = new Map();

const pinPhotosCacheKey = (pinId) => `pin_photos_cache_${pinId}`;
const pinMetaCacheKey = (pinId) => `pin_meta_cache_${pinId}`;

function normalizePinId(pinId) {
  if (!pinId) return null;
  return String(pinId);
}

function isFresh(fetchedAt, ttlMs) {
  return Number.isFinite(fetchedAt) && Date.now() - fetchedAt <= ttlMs;
}

function getFetchedAtOrNow(fetchedAt) {
  return Number.isFinite(fetchedAt) ? fetchedAt : Date.now();
}

export async function readPinPhotosCache(pinId, { ttlMs = PIN_PHOTOS_CACHE_TTL_MS } = {}) {
  const normalizedPinId = normalizePinId(pinId);
  if (!normalizedPinId) {
    return { photos: [], hadCache: false, isFresh: false };
  }

  const memoryCached = pinPhotosMemoryCache.get(normalizedPinId);
  if (Array.isArray(memoryCached?.photos)) {
    return {
      photos: memoryCached.photos,
      hadCache: true,
      isFresh: isFresh(memoryCached.fetchedAt, ttlMs),
    };
  }

  try {
    const raw = await AsyncStorage.getItem(pinPhotosCacheKey(normalizedPinId));
    if (!raw) {
      return { photos: [], hadCache: false, isFresh: false };
    }
    const parsed = JSON.parse(raw);
    const cachedPhotos = Array.isArray(parsed?.photos) ? parsed.photos : null;
    if (!cachedPhotos) {
      return { photos: [], hadCache: false, isFresh: false };
    }
    const fetchedAt = Number.isFinite(parsed?.fetchedAt) ? parsed.fetchedAt : null;
    pinPhotosMemoryCache.set(normalizedPinId, { photos: cachedPhotos, fetchedAt });
    return {
      photos: cachedPhotos,
      hadCache: true,
      isFresh: isFresh(fetchedAt, ttlMs),
    };
  } catch (error) {
    console.warn('Failed to read pin photos cache', error);
    return { photos: [], hadCache: false, isFresh: false };
  }
}

export async function writePinPhotosCache(pinId, photos, { fetchedAt = Date.now() } = {}) {
  const normalizedPinId = normalizePinId(pinId);
  if (!normalizedPinId || !Array.isArray(photos)) return;

  const safeFetchedAt = getFetchedAtOrNow(fetchedAt);
  pinPhotosMemoryCache.set(normalizedPinId, { photos, fetchedAt: safeFetchedAt });

  try {
    await AsyncStorage.setItem(
      pinPhotosCacheKey(normalizedPinId),
      JSON.stringify({ photos, fetchedAt: safeFetchedAt })
    );
  } catch (error) {
    console.warn('Failed to write pin photos cache', error);
  }
}

export async function readPinMetaCache(pinId, { ttlMs = PIN_META_CACHE_TTL_MS } = {}) {
  const normalizedPinId = normalizePinId(pinId);
  if (!normalizedPinId) {
    return { meta: null, hadCache: false, isFresh: false };
  }

  const memoryCached = pinMetaMemoryCache.get(normalizedPinId);
  if (memoryCached?.meta && typeof memoryCached.meta === 'object') {
    return {
      meta: memoryCached.meta,
      hadCache: true,
      isFresh: isFresh(memoryCached.fetchedAt, ttlMs),
    };
  }

  try {
    const raw = await AsyncStorage.getItem(pinMetaCacheKey(normalizedPinId));
    if (!raw) {
      return { meta: null, hadCache: false, isFresh: false };
    }
    const parsed = JSON.parse(raw);
    const cachedMeta = parsed?.meta && typeof parsed.meta === 'object' ? parsed.meta : null;
    if (!cachedMeta) {
      return { meta: null, hadCache: false, isFresh: false };
    }
    const fetchedAt = Number.isFinite(parsed?.fetchedAt) ? parsed.fetchedAt : null;
    pinMetaMemoryCache.set(normalizedPinId, { meta: cachedMeta, fetchedAt });
    return {
      meta: cachedMeta,
      hadCache: true,
      isFresh: isFresh(fetchedAt, ttlMs),
    };
  } catch (error) {
    console.warn('Failed to read pin meta cache', error);
    return { meta: null, hadCache: false, isFresh: false };
  }
}

export async function writePinMetaCache(pinId, meta, { fetchedAt = Date.now() } = {}) {
  const normalizedPinId = normalizePinId(pinId);
  if (!normalizedPinId || !meta || typeof meta !== 'object') return;

  const safeFetchedAt = getFetchedAtOrNow(fetchedAt);
  pinMetaMemoryCache.set(normalizedPinId, { meta, fetchedAt: safeFetchedAt });

  try {
    await AsyncStorage.setItem(
      pinMetaCacheKey(normalizedPinId),
      JSON.stringify({ meta, fetchedAt: safeFetchedAt })
    );
  } catch (error) {
    console.warn('Failed to write pin meta cache', error);
  }
}
