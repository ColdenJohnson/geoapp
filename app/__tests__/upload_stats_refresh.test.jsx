import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import Upload from '@/app/upload';

const mockInvalidateStats = jest.fn();

jest.mock('@/lib/promiseStore', () => ({
  resolveUpload: jest.fn(),
  resolveUploadSubmit: jest.fn(),
}));

jest.mock('@/lib/uploadQueue', () => ({
  enqueueAddPhotoUpload: jest.fn(),
  waitForUploadQueueItem: jest.fn(),
}));

jest.mock('@/hooks/AuthContext', () => {
  const React = require('react');
  return {
    AuthContext: React.createContext({
      profile: { handle: 'tester' },
      invalidateStats: mockInvalidateStats,
    }),
  };
});

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  getLastKnownPositionAsync: jest.fn(async () => null),
  getCurrentPositionAsync: jest.fn(async () => null),
}));

const { enqueueAddPhotoUpload, waitForUploadQueueItem } = require('@/lib/uploadQueue');
const { router } = require('expo-router');
const cameraModule = require('react-native-vision-camera');
const expoRouter = require('expo-router');

describe('Upload stats refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidateStats.mockClear();
    router.back.mockClear();
    router.replace.mockClear();
    expoRouter.useLocalSearchParams.mockReturnValue({});
    cameraModule.useCameraPermission.mockReturnValue({ hasPermission: true, requestPermission: jest.fn() });
  });

  it('invalidates stats after the queued upload actually completes', async () => {
    enqueueAddPhotoUpload.mockResolvedValue({ id: 'queue-123' });
    waitForUploadQueueItem.mockResolvedValue({ success: true });

    const { getByText } = render(<Upload initialUri="file://mock.jpg" />);

    fireEvent.press(getByText('UPLOAD>'));

    await waitFor(() => expect(enqueueAddPhotoUpload).toHaveBeenCalled());
    await waitFor(() => expect(waitForUploadQueueItem).toHaveBeenCalledWith('queue-123'));
    await waitFor(() => expect(mockInvalidateStats).toHaveBeenCalled());
  });
});
