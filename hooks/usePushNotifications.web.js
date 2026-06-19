// Web-only no-op: push notifications are not available in the designer sandbox.

export function usePushNotifications() {}

export async function getNotificationPermissionStatus() {
  return 'denied';
}

export async function requestNotificationPermission() {
  return 'denied';
}

export async function ensurePushRegistration() {
  return null;
}
