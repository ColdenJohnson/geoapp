export function goBackOrHome(router, fallbackPath = '/') {
  if (router?.canGoBack?.()) {
    router.back();
    return;
  }
  router.replace(fallbackPath);
}

export function buildViewPhotoChallengeRoute({
  pinId,
  message = '',
  createdByHandle = '',
  optimisticPhotoUrls = [],
} = {}) {
  const params = {
    pinId: pinId == null ? '' : String(pinId),
    message: typeof message === 'string' ? message : '',
    created_by_handle: typeof createdByHandle === 'string' ? createdByHandle : '',
  };

  const normalizedOptimisticPhotoUrls = Array.isArray(optimisticPhotoUrls)
    ? optimisticPhotoUrls.filter((url) => typeof url === 'string' && url.length > 0)
    : [];

  if (normalizedOptimisticPhotoUrls.length > 0) {
    params.optimistic_photo_urls = JSON.stringify(normalizedOptimisticPhotoUrls);
  }

  return {
    pathname: '/view_photochallenge',
    params,
  };
}
