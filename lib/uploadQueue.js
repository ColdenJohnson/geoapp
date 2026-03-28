import AsyncStorage from '@react-native-async-storage/async-storage';
import auth from '@react-native-firebase/auth';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system';
import { AppState } from 'react-native';

import { addPhoto, newChallenge } from '@/lib/api';
import {
  readPinPhotosCache,
  updatePinPhotosCache,
  writePinMetaCache,
  writePinPhotosCache,
} from '@/lib/pinChallengeCache';
import { uploadImage } from '@/lib/uploadHelpers';

const QUEUE_STORAGE_KEY_PREFIX = 'upload_queue_v1';
const COMPLETION_CACHE_TTL_MS = 5 * 60 * 1000;
const QUEUED_UPLOAD_DIR = `${FileSystem.documentDirectory || ''}queued-uploads/`;
const NETWORK_ERROR_CODES = new Set([
  'storage/network-request-failed',
  'storage/retry-limit-exceeded',
  'ERR_NETWORK',
  'ECONNABORTED',
]);

let hydrationPromise = null;
let hydratedUid = null;
let queueItems = [];
let isProcessing = false;
let initializedUid = null;
let netInfoUnsubscribe = null;
let appStateSubscription = null;

const listeners = new Set();
const waitersById = new Map();
const completionCache = new Map();

function getCurrentUid() {
  const uid = auth().currentUser?.uid;
  return typeof uid === 'string' && uid ? uid : null;
}

function getStorageKey(uid) {
  return `${QUEUE_STORAGE_KEY_PREFIX}:${uid}`;
}

function cloneQueueItem(item) {
  return item ? { ...item } : item;
}

function emitQueueSnapshot() {
  const snapshot = queueItems.map(cloneQueueItem);
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (error) {
      console.warn('Upload queue listener failed', error);
    }
  }
}

function cacheCompletionResult(id, result) {
  if (!id) return;
  completionCache.set(id, result);
  globalThis.setTimeout(() => {
    if (completionCache.get(id) === result) {
      completionCache.delete(id);
    }
  }, COMPLETION_CACHE_TTL_MS);
}

function settleWaiters(id, payload) {
  const waiters = waitersById.get(id);
  if (!waiters?.length) return;
  waitersById.delete(id);
  for (const waiter of waiters) {
    waiter(payload);
  }
}

async function ensureQueueDirectory() {
  if (!FileSystem.documentDirectory) {
    throw new Error('FileSystem document directory is unavailable');
  }
  const info = await FileSystem.getInfoAsync(QUEUED_UPLOAD_DIR);
  if (!info?.exists) {
    await FileSystem.makeDirectoryAsync(QUEUED_UPLOAD_DIR, { intermediates: true });
  }
}

function sanitizeFileSegment(value, fallback = 'upload.jpg') {
  const input = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  return input.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function extractFileExtension(uri) {
  const match = typeof uri === 'string' ? uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/) : null;
  return match?.[1] ? `.${match[1].toLowerCase()}` : '.jpg';
}

async function persistQueue(uid = hydratedUid) {
  if (!uid) return;
  await AsyncStorage.setItem(
    getStorageKey(uid),
    JSON.stringify({
      items: queueItems,
      updatedAt: Date.now(),
    })
  );
  emitQueueSnapshot();
}

async function ensureHydrated() {
  const uid = getCurrentUid();
  if (!uid) {
    hydratedUid = null;
    queueItems = [];
    emitQueueSnapshot();
    return [];
  }
  if (hydratedUid === uid) {
    return queueItems;
  }
  if (hydrationPromise) {
    return hydrationPromise;
  }

  hydrationPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(getStorageKey(uid));
      const parsed = raw ? JSON.parse(raw) : null;
      queueItems = Array.isArray(parsed?.items) ? parsed.items : [];
      hydratedUid = uid;
      await ensureQueueDirectory();
      await syncQueuedPhotosIntoCaches();
      emitQueueSnapshot();
      return queueItems;
    } finally {
      hydrationPromise = null;
    }
  })();

  return hydrationPromise;
}

function normalizeCoordinate(value) {
  const latitude = Number(value?.latitude ?? value?.coords?.latitude);
  const longitude = Number(value?.longitude ?? value?.coords?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return { latitude, longitude };
}

function buildQueuedPhoto(item) {
  return {
    _id: item.optimisticPhotoId,
    file_url: item.localUri,
    remote_file_url: item.remoteFileUrl || null,
    global_elo: 1000,
    global_wins: 0,
    global_losses: 0,
    created_by_handle: item.createdByHandle || 'you',
    createdAt: item.createdAt,
    optimistic: true,
    queue_id: item.id,
    upload_state: item.state,
    upload_error: item.error || null,
  };
}

async function upsertQueuedPhotoCache(item) {
  if (item?.type !== 'add_photo' || !item?.pinId || !item?.optimisticPhotoId) {
    return;
  }
  await updatePinPhotosCache(
    item.pinId,
    (current) => {
      const nextPhoto = buildQueuedPhoto(item);
      const existingPhotos = Array.isArray(current) ? current : [];
      const filtered = existingPhotos.filter((photo) => String(photo?._id) !== String(item.optimisticPhotoId));
      return [nextPhoto, ...filtered];
    },
    { isDirty: true }
  );
}

async function removeQueuedPhotoCache(item) {
  if (item?.type !== 'add_photo' || !item?.pinId || !item?.optimisticPhotoId) {
    return;
  }
  await updatePinPhotosCache(
    item.pinId,
    (current) => (
      Array.isArray(current)
        ? current.filter((photo) => String(photo?._id) !== String(item.optimisticPhotoId))
        : current
    ),
    { isDirty: false }
  );
}

async function replaceQueuedPhotoCache(item, finalPhoto, finalPin = null) {
  if (!item?.pinId) return;
  const normalizedFinalPhoto = finalPhoto && typeof finalPhoto === 'object'
    ? { ...finalPhoto, optimistic: false, upload_state: null, upload_error: null, queue_id: null }
    : null;

  await updatePinPhotosCache(
    item.pinId,
    (current) => {
      const existingPhotos = Array.isArray(current) ? current : [];
      const filtered = existingPhotos.filter((photo) => {
        const photoId = String(photo?._id || '');
        if (photoId && photoId === String(item.optimisticPhotoId)) return false;
        if (normalizedFinalPhoto?._id && photoId === String(normalizedFinalPhoto._id)) return false;
        return true;
      });
      return normalizedFinalPhoto ? [normalizedFinalPhoto, ...filtered] : filtered;
    },
    { isDirty: false }
  );

  if (finalPin && typeof finalPin === 'object') {
    await writePinMetaCache(item.pinId, finalPin);
  }
}

async function syncQueuedPhotosIntoCaches() {
  for (const item of queueItems) {
    if (item?.type === 'add_photo') {
      await upsertQueuedPhotoCache(item);
    }
  }
}

async function deleteLocalFile(uri) {
  if (!uri) return;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info?.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch (error) {
    console.warn('Failed to delete queued upload file', error);
  }
}

async function copySourceIntoQueue(sourceUri, queueId) {
  if (!sourceUri) {
    throw new Error('A local photo URI is required');
  }
  await ensureQueueDirectory();
  const fileName = sanitizeFileSegment(sourceUri.split('/').pop(), `upload-${queueId}${extractFileExtension(sourceUri)}`);
  const targetUri = `${QUEUED_UPLOAD_DIR}${queueId}-${fileName}`;
  await FileSystem.copyAsync({ from: sourceUri, to: targetUri });
  return targetUri;
}

function isUsableNetworkState(state) {
  return state?.isConnected === true && state?.isInternetReachable !== false;
}

async function hasUsableNetwork() {
  try {
    const state = await NetInfo.fetch();
    return isUsableNetworkState(state);
  } catch (error) {
    console.warn('Failed to inspect network state for upload queue', error);
    return true;
  }
}

function isProbablyNetworkError(error) {
  if (!error) return false;
  if (NETWORK_ERROR_CODES.has(error?.code)) return true;
  if (error?.response) return false;
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  return (
    message.includes('network') ||
    message.includes('internet') ||
    message.includes('offline') ||
    message.includes('timeout')
  );
}

function getUploadErrorMessage(error) {
  const serverMessage = typeof error?.response?.data?.error === 'string'
    ? error.response.data.error.trim()
    : '';
  if (serverMessage) return serverMessage;
  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }
  return 'Upload failed';
}

async function updateQueueItem(id, updater) {
  await ensureHydrated();
  const index = queueItems.findIndex((item) => item?.id === id);
  if (index < 0) return null;
  const currentItem = queueItems[index];
  const nextItem = typeof updater === 'function'
    ? updater(currentItem)
    : { ...currentItem, ...(updater || {}) };
  if (!nextItem) {
    queueItems = queueItems.filter((item) => item?.id !== id);
    await persistQueue();
    return null;
  }
  queueItems = [
    ...queueItems.slice(0, index),
    nextItem,
    ...queueItems.slice(index + 1),
  ];
  await persistQueue();
  return nextItem;
}

async function removeQueueItem(id) {
  await ensureHydrated();
  const item = queueItems.find((entry) => entry?.id === id) || null;
  queueItems = queueItems.filter((entry) => entry?.id !== id);
  await persistQueue();
  return item;
}

async function finalizeQueueSuccess(item, result) {
  if (item?.type === 'add_photo') {
    await replaceQueuedPhotoCache(item, result?.photo || null, result?.pin || null);
  } else if (item?.type === 'new_challenge' && result?.pinId) {
    if (result?.pin && typeof result.pin === 'object') {
      await writePinMetaCache(result.pinId, result.pin);
    }
    if (result?.photo && typeof result.photo === 'object') {
      await writePinPhotosCache(result.pinId, [result.photo], { isDirty: false });
    }
  }

  const removed = await removeQueueItem(item.id);
  await deleteLocalFile(removed?.localUri || item?.localUri);
  const payload = { status: 'completed', result };
  cacheCompletionResult(item.id, payload);
  settleWaiters(item.id, payload);
}

async function finalizeQueueFailure(item, error) {
  const shouldRetryLater = isProbablyNetworkError(error) || !(await hasUsableNetwork());
  const nextState = shouldRetryLater ? 'pending' : 'failed';
  const nextItem = await updateQueueItem(item.id, {
    ...item,
    state: nextState,
    error: shouldRetryLater ? null : getUploadErrorMessage(error),
    updatedAt: new Date().toISOString(),
  });
  if (nextItem?.type === 'add_photo') {
    await upsertQueuedPhotoCache(nextItem);
  }
  if (!shouldRetryLater) {
    const payload = {
      status: 'failed',
      error: nextItem?.error || getUploadErrorMessage(error),
    };
    cacheCompletionResult(item.id, payload);
    settleWaiters(item.id, payload);
  }
}

async function processQueueItem(item) {
  let workingItem = item;

  if (!workingItem?.remoteFileUrl) {
    workingItem = await updateQueueItem(workingItem.id, {
      ...workingItem,
      state: 'uploading',
      error: null,
      updatedAt: new Date().toISOString(),
    });
    if (workingItem?.type === 'add_photo') {
      await upsertQueuedPhotoCache(workingItem);
    }

    const remoteFileUrl = await uploadImage(workingItem.localUri, {
      uploadKey: workingItem.id,
    });
    workingItem = await updateQueueItem(workingItem.id, {
      ...workingItem,
      state: 'finalizing',
      remoteFileUrl,
      error: null,
      updatedAt: new Date().toISOString(),
    });
    if (workingItem?.type === 'add_photo') {
      await upsertQueuedPhotoCache(workingItem);
    }
  } else if (workingItem.state !== 'finalizing') {
    workingItem = await updateQueueItem(workingItem.id, {
      ...workingItem,
      state: 'finalizing',
      error: null,
      updatedAt: new Date().toISOString(),
    });
    if (workingItem?.type === 'add_photo') {
      await upsertQueuedPhotoCache(workingItem);
    }
  }

  if (!workingItem?.remoteFileUrl) {
    throw new Error('Remote upload URL missing before finalization');
  }

  if (workingItem.type === 'add_photo') {
    const result = await addPhoto(workingItem.pinId, workingItem.remoteFileUrl, {
      photoLocation: normalizeCoordinate(workingItem.photoLocation),
      clientUploadId: workingItem.id,
    });
    await finalizeQueueSuccess(workingItem, result || { success: true });
    return;
  }

  if (workingItem.type === 'new_challenge') {
    const result = await newChallenge(
      workingItem.location,
      workingItem.remoteFileUrl,
      workingItem.message,
      {
        isGeoLocked: workingItem.isGeoLocked !== false,
        photoLocation: normalizeCoordinate(workingItem.photoLocation)
          || normalizeCoordinate(workingItem.location),
        clientUploadId: workingItem.id,
      }
    );
    if (!result?.pinId) {
      throw new Error('Challenge upload did not return a pinId');
    }
    await finalizeQueueSuccess(workingItem, result);
  }
}

export async function processUploadQueue() {
  await ensureHydrated();
  if (isProcessing || !queueItems.length) {
    return;
  }
  const networkUsable = await hasUsableNetwork();
  if (!networkUsable) {
    return;
  }

  isProcessing = true;
  try {
    for (const item of [...queueItems]) {
      const currentItem = queueItems.find((entry) => entry?.id === item?.id);
      if (!currentItem) continue;
      if (currentItem.state === 'failed') continue;
      try {
        await processQueueItem(currentItem);
      } catch (error) {
        console.error('Failed to process queued upload', currentItem?.id, error);
        await finalizeQueueFailure(currentItem, error);
      }
    }
  } finally {
    isProcessing = false;
  }
}

function buildBaseQueueItem({
  id,
  type,
  localUri,
  createdByHandle = null,
  remoteFileUrl = null,
  error = null,
  photoLocation = null,
}) {
  const nowIso = new Date().toISOString();
  return {
    id,
    type,
    localUri,
    remoteFileUrl,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdByHandle,
    photoLocation: normalizeCoordinate(photoLocation),
    error,
    state: 'pending',
  };
}

export async function enqueueAddPhotoUpload({
  sourceUri,
  pinId,
  createdByHandle = null,
  queueId = null,
  photoLocation = null,
}) {
  if (!pinId) {
    throw new Error('pinId is required to queue a photo upload');
  }
  const id = queueId || `upload-${pinId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const localUri = await copySourceIntoQueue(sourceUri, id);
  const nextItem = {
    ...buildBaseQueueItem({
      id,
      type: 'add_photo',
      localUri,
      createdByHandle,
      photoLocation,
    }),
    pinId: String(pinId),
    optimisticPhotoId: `optimistic-${id}`,
  };

  await ensureHydrated();
  queueItems = [nextItem, ...queueItems.filter((item) => item?.id !== id)];
  await persistQueue();
  await upsertQueuedPhotoCache(nextItem);
  void processUploadQueue();
  return nextItem;
}

export async function enqueueNewChallengeUpload({
  sourceUri,
  message,
  location,
  isGeoLocked = true,
  queueId = null,
  photoLocation = null,
}) {
  const normalizedMessage = typeof message === 'string' ? message.trim() : '';
  const normalizedLocation = normalizeCoordinate(location);
  if (!normalizedMessage) {
    throw new Error('Challenge message is required');
  }
  if (isGeoLocked && !normalizedLocation) {
    throw new Error('A valid location is required for a geo-locked challenge');
  }

  const id = queueId || `challenge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const localUri = await copySourceIntoQueue(sourceUri, id);
  const nextItem = {
    ...buildBaseQueueItem({
      id,
      type: 'new_challenge',
      localUri,
      photoLocation: normalizeCoordinate(photoLocation) || normalizedLocation,
    }),
    message: normalizedMessage,
    isGeoLocked: isGeoLocked !== false,
    location: normalizedLocation || { latitude: 0, longitude: 0 },
  };

  await ensureHydrated();
  queueItems = [nextItem, ...queueItems.filter((item) => item?.id !== id)];
  await persistQueue();
  void processUploadQueue();
  return nextItem;
}

export async function retryUploadQueueItem(id) {
  const nextItem = await updateQueueItem(id, (item) => (
    item
      ? {
          ...item,
          state: 'pending',
          error: null,
          updatedAt: new Date().toISOString(),
        }
      : item
  ));
  if (nextItem?.type === 'add_photo') {
    await upsertQueuedPhotoCache(nextItem);
  }
  completionCache.delete(id);
  void processUploadQueue();
  return nextItem;
}

export async function removeUploadQueueItem(id) {
  const item = await removeQueueItem(id);
  if (!item) return false;
  await deleteLocalFile(item.localUri);
  await removeQueuedPhotoCache(item);
  completionCache.delete(id);
  settleWaiters(id, { status: 'failed', error: 'Upload removed' });
  return true;
}

export function subscribeUploadQueue(listener) {
  listeners.add(listener);
  void ensureHydrated()
    .then(() => {
      try {
        listener(queueItems.map(cloneQueueItem));
      } catch (error) {
        console.warn('Upload queue listener failed during initial emit', error);
      }
    })
    .catch((error) => {
      console.warn('Failed to hydrate upload queue for subscription', error);
    });

  return () => {
    listeners.delete(listener);
  };
}

export function waitForUploadQueueItem(id, { timeoutMs = 5 * 60 * 1000 } = {}) {
  const cached = completionCache.get(id);
  if (cached) {
    return cached.status === 'completed'
      ? Promise.resolve(cached.result)
      : Promise.reject(new Error(cached.error || 'Upload failed'));
  }

  return new Promise((resolve, reject) => {
    const entries = waitersById.get(id) || [];
    const timeoutId = timeoutMs > 0
      ? globalThis.setTimeout(() => {
          const currentEntries = waitersById.get(id) || [];
          waitersById.set(
            id,
            currentEntries.filter((entry) => entry !== waiter)
          );
          reject(new Error('Timed out waiting for queued upload'));
        }, timeoutMs)
      : null;

    const waiter = (payload) => {
      if (timeoutId) {
        globalThis.clearTimeout(timeoutId);
      }
      if (payload?.status === 'completed') {
        resolve(payload.result);
        return;
      }
      reject(new Error(payload?.error || 'Upload failed'));
    };

    waitersById.set(id, [...entries, waiter]);
  });
}

export async function getQueuedPhotoUploadState(queueId) {
  await ensureHydrated();
  return queueItems.find((item) => item?.id === queueId) || null;
}

export function initializeUploadQueue() {
  const uid = getCurrentUid();
  if (!uid) {
    return () => {};
  }

  if (netInfoUnsubscribe) {
    netInfoUnsubscribe();
    netInfoUnsubscribe = null;
  }
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }

  initializedUid = uid;
  void ensureHydrated().then(() => {
    void processUploadQueue();
  });

  netInfoUnsubscribe = NetInfo.addEventListener((state) => {
    if (initializedUid !== getCurrentUid()) return;
    if (isUsableNetworkState(state)) {
      void processUploadQueue();
    }
  });

  appStateSubscription = AppState.addEventListener('change', (nextState) => {
    if (initializedUid !== getCurrentUid()) return;
    if (nextState === 'active') {
      void processUploadQueue();
    }
  });

  return () => {
    if (netInfoUnsubscribe) {
      netInfoUnsubscribe();
      netInfoUnsubscribe = null;
    }
    if (appStateSubscription) {
      appStateSubscription.remove();
      appStateSubscription = null;
    }
  };
}

export async function syncQueuedPhotosForPin(pinId) {
  if (!pinId) return [];
  await ensureHydrated();
  const queuedItems = queueItems.filter((item) => item?.type === 'add_photo' && String(item?.pinId) === String(pinId));
  if (!queuedItems.length) {
    const { photos } = await readPinPhotosCache(pinId, { ttlMs: Number.MAX_SAFE_INTEGER });
    return Array.isArray(photos) ? photos : [];
  }
  for (const item of queuedItems) {
    await upsertQueuedPhotoCache(item);
  }
  const { photos } = await readPinPhotosCache(pinId, { ttlMs: Number.MAX_SAFE_INTEGER });
  return Array.isArray(photos) ? photos : [];
}
