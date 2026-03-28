import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import Upload from '@/app/upload';

jest.mock('@/lib/uploadHelpers', () => ({
  uploadImage: jest.fn(),
  compressImage: jest.fn(),
}));

jest.mock('@/lib/promiseStore', () => ({
  resolveUpload: jest.fn(),
  resolveUploadSubmit: jest.fn(),
}));

jest.mock('@/lib/pinChallengeCache', () => ({
  seedPinPhotosCache: jest.fn(() => []),
  updatePinPhotosCache: jest.fn(() => Promise.resolve([])),
}));

jest.mock('@/hooks/AuthContext', () => {
  const React = require('react');
  return {
    AuthContext: React.createContext({ profile: { handle: 'tester' } }),
  };
});

jest.mock('react-native-device-info', () => ({
  isEmulator: jest.fn(async () => false),
}));

const { uploadImage } = require('@/lib/uploadHelpers');
const { resolveUpload, resolveUploadSubmit } = require('@/lib/promiseStore');
const { seedPinPhotosCache } = require('@/lib/pinChallengeCache');
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
    uploadImage.mockResolvedValue('https://download');

    const { getByText } = render(<Upload initialUri="file://mock.jpg" />);

    fireEvent.press(getByText('UPLOAD>'));

    expect(router.back).toHaveBeenCalled();
    expect(resolveUploadSubmit).toHaveBeenCalledWith({ submitted: true });

    await waitFor(() => expect(uploadImage).toHaveBeenCalledWith('file://mock.jpg'));
    expect(resolveUpload).toHaveBeenCalledWith({ fileUrl: 'https://download', photoLocation: null });
  });

  it('routes to the quest immediately after submit while upload continues in the background', async () => {
    let resolveUploadImage;
    cameraModule.useCameraPermission.mockReturnValue({ hasPermission: true, requestPermission: jest.fn() });
    uploadImage.mockImplementation(() => new Promise((resolve) => {
      resolveUploadImage = resolve;
    }));
    expoRouter.useLocalSearchParams.mockReturnValue({
      next: '/view_photochallenge',
      pinId: 'pin-123',
      prompt: 'Quest prompt',
      created_by_handle: 'maker',
      uploadRequestId: 'req-123',
    });

    const { getByText } = render(<Upload initialUri="file://mock.jpg" />);

    fireEvent.press(getByText('UPLOAD>'));

    expect(seedPinPhotosCache).toHaveBeenCalledWith(
      'pin-123',
      expect.any(Function),
      { isDirty: true }
    );
    expect(resolveUploadSubmit).toHaveBeenCalledWith({ submitted: true }, 'req-123');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/view_photochallenge',
      params: {
        pinId: 'pin-123',
        message: 'Quest prompt',
        created_by_handle: 'maker',
      },
    });
    expect(resolveUpload).not.toHaveBeenCalled();

    resolveUploadImage('https://download');

    await waitFor(() => expect(resolveUpload).toHaveBeenCalledWith(
      { fileUrl: 'https://download', photoLocation: null },
      'req-123'
    ));
  });

  it('returns to the previous screen after submit when requested while upload continues in the background', async () => {
    let resolveUploadImage;
    cameraModule.useCameraPermission.mockReturnValue({ hasPermission: true, requestPermission: jest.fn() });
    uploadImage.mockImplementation(() => new Promise((resolve) => {
      resolveUploadImage = resolve;
    }));
    expoRouter.useLocalSearchParams.mockReturnValue({
      next: '/view_photochallenge',
      pinId: 'pin-123',
      prompt: 'Quest prompt',
      created_by_handle: 'maker',
      submit_action: 'back',
      uploadRequestId: 'req-456',
    });

    const { getByText } = render(<Upload initialUri="file://mock.jpg" />);

    fireEvent.press(getByText('UPLOAD>'));

    expect(seedPinPhotosCache).toHaveBeenCalledWith(
      'pin-123',
      expect.any(Function),
      { isDirty: true }
    );
    expect(resolveUploadSubmit).toHaveBeenCalledWith({ submitted: true }, 'req-456');
    expect(router.back).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(resolveUpload).not.toHaveBeenCalled();

    resolveUploadImage('https://download');

    await waitFor(() => expect(resolveUpload).toHaveBeenCalledWith(
      { fileUrl: 'https://download', photoLocation: null },
      'req-456'
    ));
  });
});
