// Web-only no-op upload queue for the designer sandbox.
// Avoids @react-native-firebase/auth and @react-native-firebase/storage.

export async function processUploadQueue() {
  return null;
}

export async function enqueueAddPhotoUpload() {
  return null;
}

export async function enqueueNewChallengeUpload() {
  return null;
}

export async function retryUploadQueueItem() {
  return null;
}

export async function removeUploadQueueItem() {
  return null;
}

export function subscribeUploadQueue(listener) {
  listener([]);
  return () => {};
}

export function waitForUploadQueueItem() {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Not available in designer mode')), 100)
  );
}

export async function getQueuedPhotoUploadState() {
  return null;
}

export function initializeUploadQueue() {
  return () => {};
}

export async function syncQueuedPhotosForPin() {
  return null;
}
