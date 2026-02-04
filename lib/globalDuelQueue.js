import { Image } from 'expo-image';

import { fetchGlobalDuel, refreshGlobalDuelToken, isTokenFresh } from './api';

export const DEFAULT_PRELOAD_COUNT = 3;

const queue = [];
const prefetchedUris = new Set();
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
  const remainingCap = Number.isFinite(remainingVotes) ? Math.min(3, remainingVotes) : 3;
  return Math.min(targetCount, remainingCap);
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

async function fetchAndStagePair() {
  const duel = await fetchGlobalDuel();
  const photos = Array.isArray(duel?.photos) ? duel.photos.slice(0, 2) : [];
  const voteToken = typeof duel?.voteToken === 'string' ? duel.voteToken : null;
  const expiresAt = typeof duel?.expiresAt === 'string' ? duel.expiresAt : null;
  const photoIds = photos.map((p) => p?._id).filter(Boolean).slice(0, 2);
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

  await Promise.all(photos.map((photo) => prefetchImage(photo?.file_url)));
  return { photos, voteToken, expiresAt, photoIds };
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
    const nextDuel = await fetchAndStagePair();
    if (!nextDuel) {
      break;
    }
    queue.push(nextDuel);
  }
  return queue.slice();
}

export function ensurePreloadedGlobalDuels(count = DEFAULT_PRELOAD_COUNT) {
  targetCount = Math.min(3, Math.max(targetCount, count));
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
  ensurePreloadedGlobalDuels(count).catch((error) => console.error('Failed to preload after advance', error));
  return head;
}

export async function getOrLoadGlobalDuelPair(count = DEFAULT_PRELOAD_COUNT) {
  if (queue[0]?.photos?.length >= 2) {
    ensurePreloadedGlobalDuels(count).catch((error) => console.error('Failed to continue preloading', error));
    return queue[0];
  }
  await ensurePreloadedGlobalDuels(count);
  return queue[0] ?? null;
}

export function clearGlobalDuelQueue() {
  queue.length = 0;
  prefetchedUris.clear();
  targetCount = DEFAULT_PRELOAD_COUNT;
}

export function trimGlobalDuelQueue() {
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
      queueRef.splice(i, 1);
      removed = true;
      i -= 1;
      continue;
    }

    try {
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
      } else {
        queueRef.splice(i, 1);
        removed = true;
        i -= 1;
      }
    } catch (error) {
      console.warn('Failed to refresh duel token; dropping item', error);
      queueRef.splice(i, 1);
      removed = true;
      i -= 1;
    }
  }

  if (removed) {
    await ensurePreloadedGlobalDuels(targetCount);
  }
  return queueRef;
}

export function setRemainingGlobalVotes(value) {
  setRemainingGlobalVotesInternal(value);
  trimGlobalDuelQueue();
}
