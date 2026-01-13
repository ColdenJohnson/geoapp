import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { usePushNotifications } from '../usePushNotifications';
import { registerPushToken } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  registerPushToken: jest.fn(),
}));

const TestHarness = ({ user }) => {
  usePushNotifications(user);
  return null;
};

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'ios';
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
});
