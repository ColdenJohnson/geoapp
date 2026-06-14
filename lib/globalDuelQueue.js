import { Image } from 'expo-image';

import { fetchGlobalDuel, fetchGlobalDuelPool, refreshGlobalDuelToken, isTokenFresh } from './api';

export const GLOBAL_DUEL_QUEUE_TARGET = 8;
export const GLOBAL_DUEL_REFILL_THRESHOLD = 3;
export const DEFAULT_PRELOAD_COUNT = GLOBAL_DUEL_QUEUE_TARGET;

const queue = [];
const prefetchedUris = new Set();
const reservedPairKeys = new Set();
let preloadPromise = null;
let targetCount = DEFAULT_PRELOAD_COUNT;
const MAX_PRELOAD_ATTEMPTS_MULTIPLIER = 2;
let remainingVotes = null;

function setRemainingGlobalVotesInternal(value) {
  if (Number.isFinite(value)) {
    remainingVotes = Math.max(0, value);
  }
}

export function getRemainingGlobalVotes() {
  return remainingVotes;
}

function desiredQueueSize() {
  const remainingCap = Number.isFinite(remainingVotes) ? remainingVotes : targetCount;
  return Math.min(targetCount, remainingCap);
}

const IS_DEV_LOG = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

function tokenPrefix(token) {
  return typeof token === 'string' ? token.slice(0, 8) : 'none';
}

function computePairKey(pairKey, photoIds) {
  if (pairKey) return pairKey;
  if (Array.isArray(photoIds) && photoIds.length >= 2) {
    const sorted = photoIds.map(String).sort();
    return `${sorted[0]}:${sorted[1]}`;
  }
  return 'unknown';
}

function logDuelDebug(message, details) {
  if (!IS_DEV_LOG) return;
  console.log(`[global-duel] ${message}`, details);
}

async function prefetchImage(uri) {
  if (!uri) return false;
  if (prefetchedUris.has(uri)) return true;
  try {
    const cached = await Image.prefetch(uri);
    if (cached) {
      prefetchedUris.add(uri);
    }
    return true;
  } catch (error) {
    console.warn('Failed to prefetch image', uri, error);
    return false;
  }
}

function extractPhotoUris(item) {
  if (!item || !Array.isArray(item.photos)) return [];
  return item.photos
    .slice(0, 2)
    .map((photo) => photo?.file_url)
    .filter((uri) => typeof uri === 'string' && uri.length > 0);
}

function queueHasPair(pairKey, queueRef = queue) {
  if (!pairKey || !Array.isArray(queueRef)) return false;
  return queueRef.some((item) => computePairKey(item?.pairKey, item?.photoIds) === pairKey);
}

async function cachePhotosForQueue(queueRef = queue) {
  if (!Array.isArray(queueRef) || queueRef.length === 0) return;
  const uris = queueRef.flatMap((item) => extractPhotoUris(item));
  if (!uris.length) return;
  await Promise.all(uris.map((uri) => prefetchImage(uri)));
}

function scheduleCachePhotosForQueue(queueRef = queue) {
  cachePhotosForQueue(queueRef).catch((error) => console.warn('Failed to cache queued duel photos', error));
}

function shouldRefillQueue() {
  const desired = desiredQueueSize();
  return queue.length < desired && queue.length < GLOBAL_DUEL_REFILL_THRESHOLD;
}

function stageDuelPayload(duel) {
  const photos = Array.isArray(duel?.photos) ? duel.photos.slice(0, 2) : [];
  const voteToken = typeof duel?.voteToken === 'string' ? duel.voteToken : null;
  const expiresAt = typeof duel?.expiresAt === 'string' ? duel.expiresAt : null;
  const payloadPhotoIds = Array.isArray(duel?.photoIds)
    ? duel.photoIds.map((id) => String(id)).filter(Boolean).slice(0, 2)
    : [];
  const photoIds = payloadPhotoIds.length >= 2
    ? payloadPhotoIds
    : photos.map((p) => p?._id).filter(Boolean).slice(0, 2);
  if (Number.isFinite(duel?.remainingVotes)) {
    setRemainingGlobalVotesInternal(duel.remainingVotes);
    trimGlobalDuelQueue();
  }

  if (remainingVotes === 0) {
    return null;
  }
  if (photos.length < 2) {
    return null;
  }
  if (!voteToken) {
    console.warn('Received global duel without voteToken; skipping');
    return null;
  }

  return {
    photos,
    voteToken,
    expiresAt,
    photoIds,
    pairKey: computePairKey(duel?.pairKey, photoIds),
    bucketType: duel?.bucketType || null,
    pinId: duel?.pinId || null,
  };
}

async function fetchAndStagePair() {
  const duel = await fetchGlobalDuel();
  return stageDuelPayload(duel);
}

async function runPreload() {
  let attempts = 0;
  const maxAttempts = targetCount * MAX_PRELOAD_ATTEMPTS_MULTIPLIER;

  const targetSize = desiredQueueSize;

  if (targetSize() === 0) {
    return queue.slice();
  }

  while (queue.length < targetSize() && attempts < maxAttempts) {
    attempts += 1;
    const beforeLength = queue.length;
    const batchLoaded = await fetchAndQueueBatch(targetCount);
    if (queue.length >= targetSize()) {
      break;
    }
    if (!batchLoaded || queue.length === beforeLength) {
      const staged = await fetchAndQueuePair();
      if (!staged || queue.length === beforeLength) {
        break;
      }
    }
  }
  scheduleCachePhotosForQueue(queue);
  return queue.slice();
}

async function fetchAndQueuePair() {
  const nextDuel = await fetchAndStagePair();
  const status = queueStagedPair(nextDuel);
  scheduleCachePhotosForQueue(queue);
  return status !== 'empty';
}

async function fetchAndQueueBatch(count = targetCount) {
  const batch = await fetchGlobalDuelPool(count);
  if (Number.isFinite(batch?.remainingVotes)) {
    setRemainingGlobalVotesInternal(batch.remainingVotes);
    trimGlobalDuelQueue();
  }
  if (remainingVotes === 0) {
    return false;
  }
  const items = Array.isArray(batch?.items) ? batch.items : [];
  if (!items.length) {
    return false;
  }

  let addedCount = 0;
  for (const item of items) {
    if (queue.length >= desiredQueueSize()) {
      break;
    }
    const status = queueStagedPair(stageDuelPayload(item));
    if (status === 'added') {
      addedCount += 1;
    }
  }
  scheduleCachePhotosForQueue(queue);
  return addedCount > 0 || items.length > 0;
}

function queueStagedPair(nextDuel) {
  if (!nextDuel) {
    return 'empty';
  }
  const pairKey = computePairKey(nextDuel.pairKey, nextDuel.photoIds);
  if (reservedPairKeys.has(pairKey)) {
    console.warn('[global-duel] reserved pair re-served; frontend rejected', {
      pairKey,
      photoIds: nextDuel.photoIds,
      queueLength: queue.length,
    });
    logDuelDebug('reserved-pair-skip', {
      pairKey,
      photoIds: nextDuel.photoIds,
      queueLength: queue.length,
    });
    return 'skipped';
  }
  if (queueHasPair(pairKey, queue)) {
    console.warn('[global-duel] backend served duplicate pair; frontend rejected', {
      pairKey,
      photoIds: nextDuel.photoIds,
      queueLength: queue.length,
    });
    logDuelDebug('duplicate-pair-skip', {
      pairKey,
      photoIds: nextDuel.photoIds,
      queueLength: queue.length,
    });
    return 'skipped';
  }
  nextDuel.pairKey = pairKey;
  queue.push(nextDuel);
  logDuelDebug('fetched', {
    pairKey,
    photoIds: nextDuel.photoIds,
    token: tokenPrefix(nextDuel.voteToken),
    expiresAt: nextDuel.expiresAt,
    remainingVotes: getRemainingGlobalVotes() ?? 'n/a',
    queueLength: queue.length,
  });
  return 'added';
}

export function ensurePreloadedGlobalDuels(count = DEFAULT_PRELOAD_COUNT) {
  targetCount = Math.max(targetCount, count);
  if (!preloadPromise) {
    preloadPromise = runPreload().finally(() => {
      preloadPromise = null;
    });
  }
  return preloadPromise;
}

export function getCurrentGlobalDuelPair() {
  return queue[0] ?? null;
}

export function advanceGlobalDuelQueue(count = DEFAULT_PRELOAD_COUNT) {
  queue.shift();
  const head = queue[0] ?? null;
  scheduleCachePhotosForQueue(queue);
  if (shouldRefillQueue()) {
    ensurePreloadedGlobalDuels(count).catch((error) => console.error('Failed to preload after advance', error));
  }
  return head;
}

export async function getOrLoadFirstGlobalDuelPair(count = DEFAULT_PRELOAD_COUNT) {
  if (queue[0]?.photos?.length >= 2) {
    scheduleCachePhotosForQueue(queue);
    if (shouldRefillQueue()) {
      ensurePreloadedGlobalDuels(count).catch((error) => console.error('Failed to continue preloading', error));
    }
    return queue[0];
  }

  await ensurePreloadedGlobalDuels(count);

  const head = queue[0] ?? null;
  if (head) {
    scheduleCachePhotosForQueue(queue);
    if (shouldRefillQueue()) {
      ensurePreloadedGlobalDuels(count).catch((error) => console.error('Failed to continue preloading', error));
    }
  }
  return head;
}

export function clearGlobalDuelQueue() {
  queue.length = 0;
  prefetchedUris.clear();
  targetCount = DEFAULT_PRELOAD_COUNT;
}

function trimGlobalDuelQueue() {
  const target = desiredQueueSize();
  while (queue.length > target) {
    queue.pop();
  }
}

function extractPhotoIds(item) {
  if (!item) return [];
  if (Array.isArray(item.photoIds) && item.photoIds.length >= 2) {
    return item.photoIds.slice(0, 2);
  }
  if (Array.isArray(item.photos)) {
    return item.photos.map((p) => p?._id).filter(Boolean).slice(0, 2);
  }
  return [];
}

export function reserveGlobalDuelPair(itemOrPhotoIds) {
  const item = Array.isArray(itemOrPhotoIds) ? null : itemOrPhotoIds;
  const photoIds = Array.isArray(itemOrPhotoIds)
    ? itemOrPhotoIds.map((id) => String(id)).filter(Boolean).slice(0, 2)
    : extractPhotoIds(item);
  const pairKey = computePairKey(item?.pairKey, photoIds);
  if (!pairKey || pairKey === 'unknown') {
    return null;
  }
  reservedPairKeys.add(pairKey);
  logDuelDebug('reserved', {
    pairKey,
    photoIds,
    queueLength: queue.length,
  });
  return pairKey;
}

export async function ensureFreshTokensForQueue(scope = 'global', queueRef = queue) {
  if (!Array.isArray(queueRef) || queueRef.length === 0) return queueRef;

  let removed = false;
  for (let i = 0; i < queueRef.length; i += 1) {
    const item = queueRef[i];
    if (!item) {
      queueRef.splice(i, 1);
      removed = true;
      i -= 1;
      continue;
    }
    const { voteToken, expiresAt } = item;
    if (voteToken && isTokenFresh(expiresAt)) {
      continue;
    }

    const [photoAId, photoBId] = extractPhotoIds(item);
    if (!photoAId || !photoBId) {
      logDuelDebug('dropping stale duel (missing photo ids)', {
        pairKey: computePairKey(item?.pairKey, extractPhotoIds(item)),
        token: tokenPrefix(voteToken),
        expiresAt,
      });
      queueRef.splice(i, 1);
      removed = true;
      i -= 1;
      continue;
    }

    try {
      logDuelDebug('refreshing stale token', {
        pairKey: computePairKey(item?.pairKey, [photoAId, photoBId]),
        token: tokenPrefix(voteToken),
        expiresAt,
      });
      const refreshed =
        scope === 'global'
          ? await refreshGlobalDuelToken(photoAId, photoBId, voteToken)
          : null;

      if (refreshed?.voteToken && refreshed?.expiresAt) {
        queueRef[i] = {
          ...item,
          voteToken: refreshed.voteToken,
          expiresAt: refreshed.expiresAt,
          photoIds: [photoAId, photoBId],
        };
        logDuelDebug('refreshed token', {
          pairKey: computePairKey(item?.pairKey, [photoAId, photoBId]),
          token: tokenPrefix(refreshed.voteToken),
          expiresAt: refreshed.expiresAt,
        });
      } else {
        logDuelDebug('dropping duel after failed refresh', {
          pairKey: computePairKey(item?.pairKey, [photoAId, photoBId]),
          token: tokenPrefix(voteToken),
          expiresAt,
        });
        queueRef.splice(i, 1);
        removed = true;
        i -= 1;
      }
    } catch (error) {
      console.warn('Failed to refresh duel token; dropping item', error);
      logDuelDebug('dropping duel after refresh error', {
        pairKey: computePairKey(item?.pairKey, [photoAId, photoBId]),
        token: tokenPrefix(voteToken),
        expiresAt,
        error: error?.message,
      });
      queueRef.splice(i, 1);
      removed = true;
      i -= 1;
    }
  }

  if (removed) {
    await ensurePreloadedGlobalDuels(targetCount);
  }
  scheduleCachePhotosForQueue(queueRef);
  return queueRef;
}

export function setRemainingGlobalVotes(value) {
  setRemainingGlobalVotesInternal(value);
  trimGlobalDuelQueue();
}
