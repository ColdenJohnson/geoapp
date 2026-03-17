import AsyncStorage from '@react-native-async-storage/async-storage';

export const PIN_PHOTOS_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
export const PIN_META_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
export const PIN_COMMENTS_CACHE_TTL_MS = 5 * 60 * 1000;

const pinPhotosMemoryCache = new Map();
const pinMetaMemoryCache = new Map();
const pinCommentsMemoryCache = new Map();

const pinPhotosCacheKey = (pinId) => `pin_photos_cache_${pinId}`;
const pinMetaCacheKey = (pinId) => `pin_meta_cache_${pinId}`;
const pinCommentsCacheKey = (photoId) => `pin_comments_cache_${photoId}`;

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

function photosCacheIsDirty(photos, isDirty) {
  if (typeof isDirty === 'boolean') {
    return isDirty;
  }
  return Array.isArray(photos) && photos.some((photo) => photo?.optimistic === true);
}

export async function readPinPhotosCache(pinId, { ttlMs = PIN_PHOTOS_CACHE_TTL_MS } = {}) {
  const normalizedPinId = normalizePinId(pinId);
  if (!normalizedPinId) {
    return { photos: [], hadCache: false, isFresh: false, isDirty: false };
  }

  const memoryCached = pinPhotosMemoryCache.get(normalizedPinId);
  if (Array.isArray(memoryCached?.photos)) {
    return {
      photos: memoryCached.photos,
      hadCache: true,
      isFresh: memoryCached.isDirty !== true && isFresh(memoryCached.fetchedAt, ttlMs),
      isDirty: memoryCached.isDirty === true,
    };
  }

  try {
    const raw = await AsyncStorage.getItem(pinPhotosCacheKey(normalizedPinId));
    if (!raw) {
      return { photos: [], hadCache: false, isFresh: false, isDirty: false };
    }
    const parsed = JSON.parse(raw);
    const cachedPhotos = Array.isArray(parsed?.photos) ? parsed.photos : null;
    if (!cachedPhotos) {
      return { photos: [], hadCache: false, isFresh: false, isDirty: false };
    }
    const fetchedAt = Number.isFinite(parsed?.fetchedAt) ? parsed.fetchedAt : null;
    const isDirty = parsed?.isDirty === true;
    pinPhotosMemoryCache.set(normalizedPinId, { photos: cachedPhotos, fetchedAt, isDirty });
    return {
      photos: cachedPhotos,
      hadCache: true,
      isFresh: !isDirty && isFresh(fetchedAt, ttlMs),
      isDirty,
    };
  } catch (error) {
    console.warn('Failed to read pin photos cache', error);
    return { photos: [], hadCache: false, isFresh: false, isDirty: false };
  }
}

export async function writePinPhotosCache(pinId, photos, { fetchedAt = Date.now(), isDirty } = {}) {
  const normalizedPinId = normalizePinId(pinId);
  if (!normalizedPinId || !Array.isArray(photos)) return;

  const safeFetchedAt = getFetchedAtOrNow(fetchedAt);
  const safeIsDirty = photosCacheIsDirty(photos, isDirty);
  pinPhotosMemoryCache.set(normalizedPinId, {
    photos,
    fetchedAt: safeFetchedAt,
    isDirty: safeIsDirty,
  });

  try {
    await AsyncStorage.setItem(
      pinPhotosCacheKey(normalizedPinId),
      JSON.stringify({ photos, fetchedAt: safeFetchedAt, isDirty: safeIsDirty })
    );
  } catch (error) {
    console.warn('Failed to write pin photos cache', error);
  }
}

export function seedPinPhotosCache(pinId, updater, options = {}) {
  const normalizedPinId = normalizePinId(pinId);
  if (!normalizedPinId) return [];

  const existingMemoryCache = pinPhotosMemoryCache.get(normalizedPinId);
  const basePhotos = Array.isArray(existingMemoryCache?.photos) ? existingMemoryCache.photos : [];
  const nextPhotos = typeof updater === 'function' ? updater(basePhotos) : updater;
  const normalizedPhotos = Array.isArray(nextPhotos) ? nextPhotos : [];
  const safeFetchedAt = getFetchedAtOrNow(options?.fetchedAt);
  const safeIsDirty = photosCacheIsDirty(normalizedPhotos, options?.isDirty);
  const writeToken = Symbol(`pin-photo-seed-${normalizedPinId}`);

  pinPhotosMemoryCache.set(normalizedPinId, {
    photos: normalizedPhotos,
    fetchedAt: safeFetchedAt,
    isDirty: safeIsDirty,
    writeToken,
  });

  void (async () => {
    let photosToPersist = normalizedPhotos;

    if (!Array.isArray(existingMemoryCache?.photos)) {
      try {
        const raw = await AsyncStorage.getItem(pinPhotosCacheKey(normalizedPinId));
        if (raw) {
          const parsed = JSON.parse(raw);
          const persistedPhotos = Array.isArray(parsed?.photos) ? parsed.photos : [];
          if (persistedPhotos.length > 0 && typeof updater === 'function') {
            const mergedPersistedPhotos = updater(persistedPhotos);
            if (Array.isArray(mergedPersistedPhotos)) {
              photosToPersist = mergedPersistedPhotos;
            }
          }
        }
      } catch (error) {
        console.warn('Failed to hydrate pin photos cache before persisting optimistic photo', error);
      }
    }

    const latestMemoryCache = pinPhotosMemoryCache.get(normalizedPinId);
    if (latestMemoryCache?.writeToken !== writeToken) {
      return;
    }

    await writePinPhotosCache(normalizedPinId, photosToPersist, {
      fetchedAt: safeFetchedAt,
      isDirty: safeIsDirty,
    });
  })();

  return normalizedPhotos;
}

export async function updatePinPhotosCache(pinId, updater, options = {}) {
  const normalizedPinId = normalizePinId(pinId);
  if (!normalizedPinId) return [];

  const { photos } = await readPinPhotosCache(normalizedPinId, { ttlMs: Number.MAX_SAFE_INTEGER });
  const nextPhotos = typeof updater === 'function' ? updater(photos) : updater;
  const normalizedPhotos = Array.isArray(nextPhotos) ? nextPhotos : [];
  await writePinPhotosCache(normalizedPinId, normalizedPhotos, options);
  return normalizedPhotos;
}

export async function readPinCommentsCache(photoId, { ttlMs = PIN_COMMENTS_CACHE_TTL_MS } = {}) {
  const normalizedPhotoId = normalizePinId(photoId);
  if (!normalizedPhotoId) {
    return { comments: [], hadCache: false, isFresh: false, isDirty: false };
  }

  const memoryCached = pinCommentsMemoryCache.get(normalizedPhotoId);
  if (Array.isArray(memoryCached?.comments)) {
    return {
      comments: memoryCached.comments,
      hadCache: true,
      isFresh: memoryCached.isDirty !== true && isFresh(memoryCached.fetchedAt, ttlMs),
      isDirty: memoryCached.isDirty === true,
    };
  }

  try {
    const raw = await AsyncStorage.getItem(pinCommentsCacheKey(normalizedPhotoId));
    if (!raw) {
      return { comments: [], hadCache: false, isFresh: false, isDirty: false };
    }
    const parsed = JSON.parse(raw);
    const cachedComments = Array.isArray(parsed?.comments) ? parsed.comments : null;
    if (!cachedComments) {
      return { comments: [], hadCache: false, isFresh: false, isDirty: false };
    }
    const fetchedAt = Number.isFinite(parsed?.fetchedAt) ? parsed.fetchedAt : null;
    const isDirty = parsed?.isDirty === true;
    pinCommentsMemoryCache.set(normalizedPhotoId, { comments: cachedComments, fetchedAt, isDirty });
    return {
      comments: cachedComments,
      hadCache: true,
      isFresh: !isDirty && isFresh(fetchedAt, ttlMs),
      isDirty,
    };
  } catch (error) {
    console.warn('Failed to read pin comments cache', error);
    return { comments: [], hadCache: false, isFresh: false, isDirty: false };
  }
}

export async function writePinCommentsCache(photoId, comments, { fetchedAt = Date.now(), isDirty = false } = {}) {
  const normalizedPhotoId = normalizePinId(photoId);
  if (!normalizedPhotoId || !Array.isArray(comments)) return;

  const safeFetchedAt = getFetchedAtOrNow(fetchedAt);
  pinCommentsMemoryCache.set(normalizedPhotoId, {
    comments,
    fetchedAt: safeFetchedAt,
    isDirty: isDirty === true,
  });

  try {
    await AsyncStorage.setItem(
      pinCommentsCacheKey(normalizedPhotoId),
      JSON.stringify({ comments, fetchedAt: safeFetchedAt, isDirty: isDirty === true })
    );
  } catch (error) {
    console.warn('Failed to write pin comments cache', error);
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
