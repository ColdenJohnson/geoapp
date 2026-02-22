import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import EnterMessageScreen from '@/app/enter_message';

jest.mock('@/lib/promiseStore', () => ({
  resolveMessage: jest.fn(),
  resolveUpload: jest.fn(),
}));

jest.mock('@/lib/uploadHelpers', () => ({
  uploadImage: jest.fn(),
}));

const { resolveMessage, resolveUpload } = require('@/lib/promiseStore');
const { uploadImage } = require('@/lib/uploadHelpers');
const { router } = require('expo-router');
const cameraModule = require('expo-camera');

describe('EnterMessageScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    router.back.mockClear();
    cameraModule.useCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
  });

  it('uploads the captured photo and resolves promises in the background', async () => {
    uploadImage.mockResolvedValue('https://download');

    const { getByPlaceholderText, getByText } = render(<EnterMessageScreen initialUri="file://mock.jpg" />);

    fireEvent.changeText(getByPlaceholderText(/challenge prompt/i), '  hello world  ');
    fireEvent.press(getByText('CREATE>'));

    expect(resolveMessage).toHaveBeenCalledWith('hello world');
    expect(router.back).toHaveBeenCalled();

    await waitFor(() => expect(uploadImage).toHaveBeenCalledWith('file://mock.jpg'));
    expect(resolveUpload).toHaveBeenCalledWith('https://download');
  });

  it('requests permission when camera access is denied', () => {
    cameraModule.useCameraPermissions.mockReturnValue([{ granted: false }, jest.fn()]);

    const { getByText } = render(<EnterMessageScreen />);

    expect(getByText(/Camera access needed/i)).toBeTruthy();
  });
});
