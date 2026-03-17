import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import Upload from '@/app/upload';

jest.mock('@/lib/uploadHelpers', () => ({
  uploadImage: jest.fn(),
  compressImage: jest.fn(),
}));

jest.mock('@/lib/promiseStore', () => ({
  resolveUpload: jest.fn(),
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
const { resolveUpload } = require('@/lib/promiseStore');
const { seedPinPhotosCache } = require('@/lib/pinChallengeCache');
const { router } = require('expo-router');
const cameraModule = require('expo-camera');
const expoRouter = require('expo-router');

describe('Upload screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    router.back.mockClear();
    router.push.mockClear();
    expoRouter.useLocalSearchParams.mockReturnValue({});
    cameraModule.useCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
  });

  it('requests permission when camera access denied', () => {
    cameraModule.useCameraPermissions.mockReturnValue([{ granted: false }, jest.fn()]);

    const { getByText } = render(<Upload />);

    expect(getByText(/We need your permission/i)).toBeTruthy();
  });

  it('renders the corner back button and wires it to navigation', () => {
    const { getByText } = render(<Upload initialUri="file://mock.jpg" />);

    fireEvent.press(getByText('Back'));

    expect(router.back).toHaveBeenCalled();
  });

  it('uploads existing photo when Upload is pressed', async () => {
    cameraModule.useCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    uploadImage.mockResolvedValue('https://download');

    const { getByText } = render(<Upload initialUri="file://mock.jpg" />);

    fireEvent.press(getByText('UPLOAD>'));

    expect(router.back).toHaveBeenCalled();

    await waitFor(() => expect(uploadImage).toHaveBeenCalledWith('file://mock.jpg'));
    expect(resolveUpload).toHaveBeenCalledWith({ fileUrl: 'https://download', photoLocation: null });
  });

  it('routes to the quest immediately after submit while upload continues in the background', async () => {
    let resolveUploadImage;
    cameraModule.useCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
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
});
