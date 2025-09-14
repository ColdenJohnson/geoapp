// /promiseStore.js
let uploadPromiseResolver = null;

// TODO: this uses a global variable, and I believe this will result in bugs if multiple uploads happen at the same time (race condition?)
export function setUploadResolver(resolver) {
  uploadPromiseResolver = resolver;
  // console.log("calling setUploadResolver");
}

export function resolveUpload(result) {
  if (uploadPromiseResolver) {
    uploadPromiseResolver(result);
    // console.log("calling resolveUpload");
    uploadPromiseResolver = null; // Important: clear after use
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