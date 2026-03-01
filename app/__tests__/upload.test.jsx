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

jest.mock('react-native-device-info', () => ({
  isEmulator: jest.fn(async () => false),
}));

const { uploadImage } = require('@/lib/uploadHelpers');
const { resolveUpload } = require('@/lib/promiseStore');
const { router } = require('expo-router');
const cameraModule = require('expo-camera');

describe('Upload screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    router.back.mockClear();
    cameraModule.useCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
  });

  it('requests permission when camera access denied', () => {
    cameraModule.useCameraPermissions.mockReturnValue([{ granted: false }, jest.fn()]);

    const { getByText } = render(<Upload />);

    expect(getByText(/We need your permission/i)).toBeTruthy();
  });

  it('uploads existing photo when Upload is pressed', async () => {
    cameraModule.useCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    uploadImage.mockResolvedValue('https://download');

    const { getByText } = render(<Upload initialUri="file://mock.jpg" />);

    fireEvent.press(getByText('UPLOAD>'));

    expect(router.back).toHaveBeenCalled();

    await waitFor(() => expect(uploadImage).toHaveBeenCalledWith('file://mock.jpg'));
    expect(resolveUpload).toHaveBeenCalledWith('https://download');
  });
});
