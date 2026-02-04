import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useRootNavigationState, useRouter } from 'expo-router';

import { logNotificationEvent, registerPushToken } from '@/lib/api';

// Show alerts/sounds/badges when a notification arrives in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function resolveProjectId() {
  return (
    Constants?.expoConfig?.extra?.eas?.projectId ||
    Constants?.expoConfig?.eas?.projectId ||
    Constants?.easConfig?.projectId ||
    null
  );
}

const ROUTABLE_PATHS = new Set([
  '/',
  '/(tabs)/vote',
  '/(tabs)/profile',
  '/view_photochallenge',
  '/friends',
  '/edit_profile',
  '/upload',
  '/enter_message',
]);

function normalizeRoute(route) {
  if (typeof route !== 'string' || route.length === 0) return null;
  return route.startsWith('/') ? route : `/${route}`;
}

function buildNavigationTarget(data) {
  const normalizedRoute = normalizeRoute(data?.route);
  if (!normalizedRoute || !ROUTABLE_PATHS.has(normalizedRoute)) {
    console.log('[push][client] Ignoring notification without a routable target', data);
    return null;
  }

  const params = {};
  if (data?.pinId != null) {
    params.pinId = `${data.pinId}`;
  }

  return { pathname: normalizedRoute, params };
}

export function usePushNotifications(user) {
  const lastRegisteredToken = useRef(null);
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const [pendingInitialResponse, setPendingInitialResponse] = useState(null);
  const navigationReady = Boolean(rootNavigationState?.key);
  const userUid = user?.uid ?? null;

  const emitNotificationEvent = useCallback(
    (event, notificationLike) => {
      const data =
        notificationLike?.notification?.request?.content?.data ||
        notificationLike?.request?.content?.data ||
        notificationLike?.data ||
        notificationLike;

      logNotificationEvent({
        notificationId: data?.notificationId || data?.id || null,
        event,
        uid: userUid,
        route: data?.route,
        payload: data,
      });
    },
    [userUid]
  );

  const handleNotificationResponse = useCallback(
    (response) => {
      emitNotificationEvent('opened', response);
      const navTarget = buildNavigationTarget(
        response?.notification?.request?.content?.data || response?.notification?.request?.content
      );
      if (!navTarget) return;

      try {
        router.push(navTarget);
        console.log('[push][client] Routed from notification to', navTarget);
      } catch (err) {
        console.log('[push][client] Failed to route from notification', err?.message || err);
      }
    },
    [emitNotificationEvent, router]
  );

  useEffect(() => {
    let cancelled = false;

    async function registerAsync() {
      try {
        if (!user?.uid) {
          lastRegisteredToken.current = null;
          return;
        }
        console.log('[push][client] Starting registration for uid=', user.uid);

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
          });
        }

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== 'granted' || cancelled) {
          console.log('Push notification permission not granted; skipping registration.');
          return;
        }
        console.log('[push][client] Permission granted');

        const projectId = resolveProjectId();
        console.log('[push][client] Resolved projectId=', projectId);
        const tokenResult = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined
        );
        const expoPushToken = tokenResult?.data;
        console.log('[push][client] Expo push token=', expoPushToken);
        if (!expoPushToken || cancelled) return;

        if (lastRegisteredToken.current === expoPushToken) return;

        console.log('[push][client] Posting token to backend /register_push_token');
        await registerPushToken({
          token: expoPushToken,
          platform: Platform.OS,
          timezoneOffsetMinutes: new Date().getTimezoneOffset(),
          uid: user.uid,
        });
        console.log('[push][client] Backend registration complete');
        lastRegisteredToken.current = expoPushToken;
      } catch (err) {
        console.log('Push registration failed', err?.message || err, err?.stack);
      }
    }

    registerAsync();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  useEffect(() => {
    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Push notification received in foreground', notification?.request?.content);
      emitNotificationEvent('received', notification);
    });
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('Push notification response', response?.notification?.request?.content?.data);
      handleNotificationResponse(response);
    });

    let cancelled = false;

    Notifications.getLastNotificationResponseAsync()
      .then((lastResponse) => {
        if (!cancelled && lastResponse) {
          setPendingInitialResponse(lastResponse);
        }
      })
      .catch((err) => {
        console.log('[push][client] Failed to read last notification response', err?.message || err);
      });

    return () => {
      receivedSub.remove();
      responseSub.remove();
      cancelled = true;
    };
  }, [emitNotificationEvent, handleNotificationResponse]);

  useEffect(() => {
    if (!navigationReady || !pendingInitialResponse) return;
    handleNotificationResponse(pendingInitialResponse);
    setPendingInitialResponse(null);
  }, [handleNotificationResponse, navigationReady, pendingInitialResponse]);
}
