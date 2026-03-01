export function goBackOrHome(router, fallbackPath = '/') {
  if (router?.canGoBack?.()) {
    router.back();
    return;
  }
  router.replace(fallbackPath);
}
