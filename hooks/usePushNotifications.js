import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

import { registerPushToken } from '@/lib/api';

function shouldDebugSchedule() {
  const dev = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
  return (dev && process.env.EXPO_PUSH_DEBUG !== 'false') || process.env.EXPO_PUSH_DEBUG === 'true';
}

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

export function usePushNotifications(user) {
  const lastRegisteredToken = useRef(null);
  const debugScheduledRef = useRef(false);
  const debugDelaySeconds = 10;

  useEffect(() => {
    let cancelled = false;

    async function registerAsync() {
      if (!user?.uid) {
        lastRegisteredToken.current = null;
        return;
      }

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

      const projectId = resolveProjectId();
      const tokenResult = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined
      );
      const expoPushToken = tokenResult?.data;
      if (!expoPushToken || cancelled) return;

      if (lastRegisteredToken.current === expoPushToken) return;

      await registerPushToken({
        token: expoPushToken,
        platform: Platform.OS,
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
        uid: user.uid,
      });
      lastRegisteredToken.current = expoPushToken;

      // Temporary local notification to validate UI without backend. Remove after backend wiring is verified.
      if (shouldDebugSchedule() && !debugScheduledRef.current) {
        debugScheduledRef.current = true;
        await scheduleLocalTestNotification({
          seconds: debugDelaySeconds,
          title: 'Geode (local dev ping)',
          body: 'This is a local-only test notification. Remove when backend pushes are live.',
        });
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
    });
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('Push notification response', response);
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);
}

export async function scheduleLocalTestNotification({
  seconds = 5,
  title = 'Test notification',
  body = 'Local-only notification for debugging',
} = {}) {
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'default',
    },
    trigger: { seconds },
  });
}
