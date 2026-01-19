import { Image } from 'expo-image';

import { fetchGlobalDuel } from './api';

export const DEFAULT_PRELOAD_COUNT = 3;

const queue = [];
const prefetchedUris = new Set();
let preloadPromise = null;
let targetCount = DEFAULT_PRELOAD_COUNT;

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
  const pair = await fetchGlobalDuel();
  const nextPair = Array.isArray(pair) ? pair.slice(0, 2) : [];
  if (nextPair.length < 2) return [];
  await Promise.all(nextPair.map((photo) => prefetchImage(photo?.file_url)));
  return nextPair;
}

async function runPreload() {
  while (queue.length < targetCount) {
    const nextPair = await fetchAndStagePair();
    if (nextPair.length < 2) break;
    queue.push(nextPair);
  }
  return queue.slice();
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
  return queue[0] ?? [];
}

export function advanceGlobalDuelQueue(count = DEFAULT_PRELOAD_COUNT) {
  queue.shift();
  const head = queue[0] ?? [];
  ensurePreloadedGlobalDuels(count).catch((error) => console.error('Failed to preload after advance', error));
  return head;
}

export async function getOrLoadGlobalDuelPair(count = DEFAULT_PRELOAD_COUNT) {
  if (Array.isArray(queue[0]) && queue[0].length >= 2) {
    ensurePreloadedGlobalDuels(count).catch((error) => console.error('Failed to continue preloading', error));
    return queue[0];
  }
  await ensurePreloadedGlobalDuels(count);
  return queue[0] ?? [];
}

export function clearGlobalDuelQueue() {
  queue.length = 0;
  prefetchedUris.clear();
  targetCount = DEFAULT_PRELOAD_COUNT;
}
