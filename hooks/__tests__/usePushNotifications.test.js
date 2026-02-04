import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { usePushNotifications } from '../usePushNotifications';
import { registerPushToken, logNotificationEvent } from '@/lib/api';
import { testingRouter } from '../../jest.setup';

jest.mock('@/lib/api', () => ({
  registerPushToken: jest.fn(),
  logNotificationEvent: jest.fn(),
}));

const TestHarness = ({ user }) => {
  usePushNotifications(user);
  return null;
};

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'ios';
  Notifications.getLastNotificationResponseAsync.mockResolvedValue(null);
  if (Notifications.__mocks__) {
    Notifications.__mocks__.receivedListeners.length = 0;
    Notifications.__mocks__.responseListeners.length = 0;
  }
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

  it('routes when a notification response is received', async () => {
    const response = {
      notification: {
        request: { content: { data: { route: '/view_photochallenge', pinId: 'abc123' } } },
      },
    };

    const { __mocks__: { responseListeners } } = Notifications;

    render(<TestHarness user={{ uid: 'user-3' }} />);

    await waitFor(() => {
      expect(responseListeners.length).toBeGreaterThan(0);
    });

    responseListeners.forEach((cb) => cb(response));

    await waitFor(() =>
      expect(testingRouter.push).toHaveBeenCalledWith({
        pathname: '/view_photochallenge',
        params: { pinId: 'abc123' },
      })
    );

    expect(logNotificationEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'opened',
      route: '/view_photochallenge',
      uid: 'user-3',
    }));
  });

  it('handles cold-start notification by routing once navigation is ready', async () => {
    const response = {
      notification: {
        request: { content: { data: { route: '/(tabs)/vote' } } },
      },
    };

    Notifications.getLastNotificationResponseAsync.mockResolvedValueOnce(response);

    render(<TestHarness user={{ uid: 'user-4' }} />);

    await waitFor(() =>
      expect(testingRouter.push).toHaveBeenCalledWith({
        pathname: '/(tabs)/vote',
        params: {},
      })
    );

    expect(logNotificationEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'opened',
      route: '/(tabs)/vote',
      uid: 'user-4',
    }));
  });

  it('logs a received event when a foreground notification arrives', async () => {
    const notification = {
      request: { content: { data: { route: '/enter_message', notificationId: 'n-1' } } },
    };

    const { __mocks__: { receivedListeners } } = Notifications;

    render(<TestHarness user={{ uid: 'user-5' }} />);

    await waitFor(() => expect(receivedListeners.length).toBeGreaterThan(0));

    receivedListeners.forEach((cb) => cb(notification));

    expect(logNotificationEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'received',
      route: '/enter_message',
      uid: 'user-5',
      notificationId: 'n-1',
    }));
  });
});
