// /promiseStore.js
const DEFAULT_UPLOAD_RESOLVER_KEY = '__default__';
const uploadPromiseResolvers = new Map();

// TODO: this uses a global variable, and I believe this will result in bugs if multiple uploads happen at the same time (race condition?)
export function setUploadResolver(resolver, requestId = DEFAULT_UPLOAD_RESOLVER_KEY) {
  uploadPromiseResolvers.set(requestId, resolver);
  // console.log("calling setUploadResolver");
}

export function resolveUpload(result, requestId = DEFAULT_UPLOAD_RESOLVER_KEY) {
  const resolver = uploadPromiseResolvers.get(requestId);
  if (resolver) {
    resolver(result);
    // console.log("calling resolveUpload");
    uploadPromiseResolvers.delete(requestId); // Important: clear after use
  }
}

// --- Message resolver for post-upload challenge details ---
let messageResolver = null;
export function setMessageResolver(resolveFn) {
  messageResolver = resolveFn;
}
export function resolveMessage(value) {
  if (messageResolver) {
    messageResolver(value);
    messageResolver = null;
  }
}

// --- Geo lock resolver for challenge type ---
let geoLockResolver = null;
export function setGeoLockResolver(resolveFn) {
  geoLockResolver = resolveFn;
}
export function resolveGeoLock(value) {
  if (geoLockResolver) {
    geoLockResolver(value);
    geoLockResolver = null;
  }
}
