// /promiseStore.js
let uploadPromiseResolver = null;

export function setUploadResolver(resolver) {
  uploadPromiseResolver = resolver;
  console.log("calling setUploadResolver");
}

export function resolveUpload(result) {
  if (uploadPromiseResolver) {
    uploadPromiseResolver(result);
    console.log("calling resolveUpload");
    uploadPromiseResolver = null; // Important: clear after use
  }
}