import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import Upload from '@/app/upload';
import { AuthContext } from '@/hooks/AuthContext';

const mockApplyUploadResult = jest.fn();

jest.mock('@/lib/promiseStore', () => ({
  resolveUpload: jest.fn(),
  resolveUploadSubmit: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => null),
  removeItem: jest.fn(async () => null),
}));

jest.mock('@react-native-firebase/auth', () => jest.fn(() => ({
  currentUser: null,
  onAuthStateChanged: jest.fn(() => jest.fn()),
  onIdTokenChanged: jest.fn(() => jest.fn()),
})));

jest.mock('@/lib/uploadQueue', () => ({
  enqueueAddPhotoUpload: jest.fn(),
  waitForUploadQueueItem: jest.fn(),
}));

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
    mockApplyUploadResult.mockClear();
    router.back.mockClear();
    router.replace.mockClear();
    expoRouter.useLocalSearchParams.mockReturnValue({});
    cameraModule.useCameraPermission.mockReturnValue({ hasPermission: true, requestPermission: jest.fn() });
  });

  it('applies the upload result after the queued upload actually completes', async () => {
    enqueueAddPhotoUpload.mockResolvedValue({ id: 'queue-123' });
    waitForUploadQueueItem.mockResolvedValue({ success: true, stats: { photo_count: 10 } });

    const { getByText } = render(
      <AuthContext.Provider value={{ profile: { handle: 'tester' }, applyUploadResult: mockApplyUploadResult }}>
        <Upload initialUri="file://mock.jpg" />
      </AuthContext.Provider>
    );

    fireEvent.press(getByText('UPLOAD>'));

    await waitFor(() => expect(enqueueAddPhotoUpload).toHaveBeenCalled());
    await waitFor(() => expect(waitForUploadQueueItem).toHaveBeenCalledWith('queue-123'));
    await waitFor(() => expect(mockApplyUploadResult).toHaveBeenCalledWith({ success: true, stats: { photo_count: 10 } }));
  });
});
