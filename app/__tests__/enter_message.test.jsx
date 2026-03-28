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
const cameraModule = require('react-native-vision-camera');

describe('EnterMessageScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    router.back.mockClear();
    cameraModule.useCameraPermission.mockReturnValue({ hasPermission: true, requestPermission: jest.fn() });
  });

  it('uploads the captured photo and resolves promises in the background', async () => {
    uploadImage.mockResolvedValue('https://download');

    const { getByPlaceholderText, getByText } = render(<EnterMessageScreen initialUri="file://mock.jpg" />);

    fireEvent.changeText(getByPlaceholderText(/challenge prompt/i), '  hello world  ');
    fireEvent.press(getByText('CREATE>'));

    expect(resolveMessage).toHaveBeenCalledWith('hello world');
    expect(resolveGeoLock).toHaveBeenCalledWith(false);
    expect(router.back).toHaveBeenCalled();

    await waitFor(() => expect(uploadImage).toHaveBeenCalledWith('file://mock.jpg'));
    expect(resolveUpload).toHaveBeenCalledWith('https://download');
  });

  it('renders the shared camera controls before a photo is taken', () => {
    const { getByTestId } = render(<EnterMessageScreen />);

    expect(getByTestId('camera-lens-0.5x')).toBeTruthy();
    expect(getByTestId('camera-lens-1x')).toBeTruthy();
    expect(getByTestId('camera-timer-10')).toBeTruthy();
    expect(getByTestId('camera-flash-toggle')).toBeTruthy();
    expect(getByTestId('camera-shutter')).toBeTruthy();
  });

  it('sends unlocked challenge type when checkbox is toggled off', async () => {
    uploadImage.mockResolvedValue('https://download');

    const { getByPlaceholderText, getByText } = render(<EnterMessageScreen initialUri="file://mock.jpg" />);

    fireEvent.press(getByText('Location locked'));
    fireEvent.changeText(getByPlaceholderText(/challenge prompt/i), 'not geolocked');
    fireEvent.press(getByText('CREATE>'));

    expect(resolveGeoLock).toHaveBeenCalledWith(true);
    await waitFor(() => expect(uploadImage).toHaveBeenCalledWith('file://mock.jpg'));
  });
  it('requests permission when camera access is denied', () => {
    cameraModule.useCameraPermission.mockReturnValue({ hasPermission: false, requestPermission: jest.fn() });

    const { getByText } = render(<EnterMessageScreen />);

    expect(getByText(/Camera access needed/i)).toBeTruthy();
  });

  it('renders the corner back button and wires it to navigation', () => {
    const { getByText } = render(<EnterMessageScreen initialUri="file://mock.jpg" />);

    fireEvent.press(getByText('Back'));

    expect(router.back).toHaveBeenCalled();
  });

  it('resolves both promises when leaving before submit', () => {
    const { unmount } = render(<EnterMessageScreen initialUri="file://mock.jpg" />);

    unmount();

    expect(resolveUpload).toHaveBeenCalledWith(null);
    expect(resolveMessage).toHaveBeenCalledWith('');
    expect(resolveGeoLock).toHaveBeenCalledWith(false);
  });
});
