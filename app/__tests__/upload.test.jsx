import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import Upload from '@/app/upload';

jest.mock('@/lib/promiseStore', () => ({
  resolveUpload: jest.fn(),
  resolveUploadSubmit: jest.fn(),
}));

jest.mock('@/lib/uploadQueue', () => ({
  enqueueAddPhotoUpload: jest.fn(),
}));

jest.mock('@/hooks/AuthContext', () => {
  const React = require('react');
  return {
    AuthContext: React.createContext({ profile: { handle: 'tester' } }),
  };
});

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  getLastKnownPositionAsync: jest.fn(async () => null),
  getCurrentPositionAsync: jest.fn(async () => null),
}));

const { enqueueAddPhotoUpload } = require('@/lib/uploadQueue');
const { resolveUpload, resolveUploadSubmit } = require('@/lib/promiseStore');
const { router } = require('expo-router');
const cameraModule = require('react-native-vision-camera');
const expoRouter = require('expo-router');

describe('Upload screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    router.back.mockClear();
    router.push.mockClear();
    expoRouter.useLocalSearchParams.mockReturnValue({});
    cameraModule.useCameraPermission.mockReturnValue({ hasPermission: true, requestPermission: jest.fn() });
  });

  it('requests permission when camera access denied', () => {
    cameraModule.useCameraPermission.mockReturnValue({ hasPermission: false, requestPermission: jest.fn() });

    const { getByText } = render(<Upload />);

    expect(getByText(/We need your permission/i)).toBeTruthy();
  });

  it('renders the corner back button and wires it to navigation', () => {
    const { getByText } = render(<Upload initialUri="file://mock.jpg" />);

    fireEvent.press(getByText('Back'));

    expect(router.back).toHaveBeenCalled();
  });

  it('renders the shared camera controls before a photo is taken', async () => {
    const { getByTestId } = render(<Upload />);

    expect(getByTestId('camera-lens-0.5x')).toBeTruthy();
    expect(getByTestId('camera-lens-1x')).toBeTruthy();
    expect(getByTestId('camera-timer-3')).toBeTruthy();
    expect(getByTestId('camera-flash-toggle')).toBeTruthy();
    expect(getByTestId('camera-shutter')).toBeTruthy();
  });

  it('uploads existing photo when Upload is pressed', async () => {
    cameraModule.useCameraPermission.mockReturnValue({ hasPermission: true, requestPermission: jest.fn() });
    enqueueAddPhotoUpload.mockResolvedValue({ id: 'queue-1' });

    const { getByText } = render(<Upload initialUri="file://mock.jpg" />);

    fireEvent.press(getByText('UPLOAD>'));

    await waitFor(() => expect(enqueueAddPhotoUpload).toHaveBeenCalledWith({
      sourceUri: 'file://mock.jpg',
      pinId: '',
      createdByHandle: 'tester',
      queueId: null,
      photoLocation: null,
    }));
    expect(router.back).toHaveBeenCalled();
    expect(resolveUploadSubmit).toHaveBeenCalledWith({ submitted: true });
    expect(resolveUpload).toHaveBeenCalledWith({ queued: true, photoLocation: null });
  });

  it('routes to the quest immediately after submit while the queued upload continues in the background', async () => {
    cameraModule.useCameraPermission.mockReturnValue({ hasPermission: true, requestPermission: jest.fn() });
    enqueueAddPhotoUpload.mockResolvedValue({ id: 'req-123' });
    expoRouter.useLocalSearchParams.mockReturnValue({
      next: '/view_photochallenge',
      pinId: 'pin-123',
      prompt: 'Quest prompt',
      created_by_handle: 'maker',
      uploadRequestId: 'req-123',
    });

    const { getByText } = render(<Upload initialUri="file://mock.jpg" />);

    fireEvent.press(getByText('UPLOAD>'));

    await waitFor(() => expect(enqueueAddPhotoUpload).toHaveBeenCalledWith({
      sourceUri: 'file://mock.jpg',
      pinId: 'pin-123',
      createdByHandle: 'tester',
      queueId: 'req-123',
      photoLocation: null,
    }));
    expect(resolveUploadSubmit).toHaveBeenCalledWith({ submitted: true }, 'req-123');
    expect(resolveUpload).toHaveBeenCalledWith(
      { queued: true, queueId: 'req-123', photoLocation: null },
      'req-123'
    );
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/view_photochallenge',
      params: {
        pinId: 'pin-123',
        message: 'Quest prompt',
        created_by_handle: 'maker',
      },
    });
  });

});
