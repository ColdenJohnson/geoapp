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
} = {}) {
  const params = {
    pinId: pinId == null ? '' : String(pinId),
    message: typeof message === 'string' ? message : '',
    created_by_handle: typeof createdByHandle === 'string' ? createdByHandle : '',
  };

  return {
    pathname: '/view_photochallenge',
    params,
  };
}
