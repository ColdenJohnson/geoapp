import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import EnterMessageScreen from '@/app/enter_message';

jest.mock('@/lib/promiseStore', () => ({
  resolveGeoLock: jest.fn(),
  resolveMessage: jest.fn(),
  resolveUpload: jest.fn(),
}));

jest.mock('@/lib/uploadHelpers', () => ({
  uploadImage: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const { resolveGeoLock, resolveMessage, resolveUpload } = require('@/lib/promiseStore');
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
    expect(resolveGeoLock).toHaveBeenCalledWith(true);
    expect(router.back).toHaveBeenCalled();

    await waitFor(() => expect(uploadImage).toHaveBeenCalledWith('file://mock.jpg'));
    expect(resolveUpload).toHaveBeenCalledWith('https://download');
  });

  it('sends unlocked challenge type when checkbox is toggled off', async () => {
    uploadImage.mockResolvedValue('https://download');

    const { getByPlaceholderText, getByText } = render(<EnterMessageScreen initialUri="file://mock.jpg" />);

    fireEvent.press(getByText('Location locked'));
    fireEvent.changeText(getByPlaceholderText(/challenge prompt/i), 'not geolocked');
    fireEvent.press(getByText('CREATE>'));

    expect(resolveGeoLock).toHaveBeenCalledWith(false);
    await waitFor(() => expect(uploadImage).toHaveBeenCalledWith('file://mock.jpg'));
  });

  it('requests permission when camera access is denied', () => {
    cameraModule.useCameraPermissions.mockReturnValue([{ granted: false }, jest.fn()]);

    const { getByText } = render(<EnterMessageScreen />);

    expect(getByText(/Camera access needed/i)).toBeTruthy();
  });

  it('resolves both promises when leaving before submit', () => {
    const { unmount } = render(<EnterMessageScreen initialUri="file://mock.jpg" />);

    unmount();

    expect(resolveUpload).toHaveBeenCalledWith(null);
    expect(resolveMessage).toHaveBeenCalledWith('');
    expect(resolveGeoLock).toHaveBeenCalledWith(true);
  });
});
