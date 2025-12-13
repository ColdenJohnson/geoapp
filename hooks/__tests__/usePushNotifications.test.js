import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { usePushNotifications, scheduleLocalTestNotification } from '../usePushNotifications';
import { registerPushToken } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  registerPushToken: jest.fn(),
}));

const TestHarness = ({ user }) => {
  usePushNotifications(user);
  return null;
};

beforeAll(() => {
  global.__DEV__ = true;
});

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'ios';
  process.env.EXPO_PUSH_DEBUG = 'false';
});

describe('usePushNotifications', () => {
  it('does nothing when no user is provided', () => {
    render(<TestHarness user={null} />);
    expect(registerPushToken).not.toHaveBeenCalled();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('requests permissions and registers a token when granted', async () => {
    Notifications.getPermissionsAsync.mockResolvedValueOnce({ status: 'undetermined' });
    Notifications.requestPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });

    render(<TestHarness user={{ uid: 'user-1' }} />);

    await waitFor(() => expect(registerPushToken).toHaveBeenCalledWith({
      token: 'ExpoPushToken-mock',
      platform: 'ios',
      timezoneOffsetMinutes: expect.any(Number),
      uid: 'user-1',
    }));

    expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'mock-project-id' });
  });

  it('skips registration when permission is denied', async () => {
    Notifications.getPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    Notifications.requestPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });

    render(<TestHarness user={{ uid: 'user-2' }} />);

    await waitFor(() => expect(registerPushToken).not.toHaveBeenCalled());
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('schedules a local notification when debug flag is set', async () => {
    process.env.EXPO_PUSH_DEBUG = 'true';
    render(<TestHarness user={{ uid: 'user-3' }} />);

    await waitFor(() => expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled());
    const call = Notifications.scheduleNotificationAsync.mock.calls[0][0];
    expect(call.trigger).toEqual({ seconds: 10 });
  });
});

describe('scheduleLocalTestNotification', () => {
  it('delegates to Notifications.scheduleNotificationAsync', async () => {
    await scheduleLocalTestNotification({ seconds: 2, title: 'Hello', body: 'World' });
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: { title: 'Hello', body: 'World', sound: 'default' },
      trigger: { seconds: 2 },
    });
  });

  it('waits the specified time before firing the received listener', async () => {
    jest.useFakeTimers();

    const receivedSpy = jest.fn();
    Notifications.addNotificationReceivedListener(receivedSpy);

    // Make scheduleNotificationAsync simulate a native wait before delivering
    Notifications.scheduleNotificationAsync.mockImplementation(({ trigger }) => {
      const delayMs = (trigger?.seconds || 0) * 1000;
      setTimeout(() => {
        Notifications.__mocks__.receivedListeners.forEach((cb) =>
          cb({ request: { content: { title: 'Timer fired' } } })
        );
      }, delayMs);
      return Promise.resolve({ id: 'timer-test-id' });
    });

    scheduleLocalTestNotification({ seconds: 10, title: 'Timed', body: 'Wait' });

    jest.advanceTimersByTime(9000);
    await Promise.resolve(); // allow pending promises to flush
    expect(receivedSpy).not.toHaveBeenCalled();

    jest.advanceTimersByTime(2000);
    await Promise.resolve();
    expect(receivedSpy).toHaveBeenCalledTimes(1);

    // Restore default mock and timers
    Notifications.scheduleNotificationAsync.mockImplementation(async () => ({ id: 'local-debug-id' }));
    jest.useRealTimers();
  });
});
