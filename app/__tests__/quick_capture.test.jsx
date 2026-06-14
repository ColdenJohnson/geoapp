/* eslint-env jest */
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import QuickCaptureScreen from '@/app/(tabs)/quick_capture';

jest.mock('@/lib/api', () => ({
  fetchRankedQuests: jest.fn(),
}));

jest.mock('@/lib/uploadQueue', () => ({
  enqueueAddPhotoUpload: jest.fn(),
  enqueueNewChallengeUpload: jest.fn(),
  waitForUploadQueueItem: jest.fn(),
}));

jest.mock('@/hooks/AuthContext', () => {
  const React = require('react');
  return {
    AuthContext: React.createContext({
      profile: { handle: 'tester' },
      applyUploadResult: jest.fn(),
    }),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }) => <>{children}</>,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const { fetchRankedQuests } = require('@/lib/api');
const { enqueueNewChallengeUpload, waitForUploadQueueItem } = require('@/lib/uploadQueue');
const { router } = require('expo-router');
const cameraModule = require('react-native-vision-camera');
const Location = require('expo-location');

async function flushInitialEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('QuickCaptureScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    router.back.mockClear();
    router.push.mockClear();
    cameraModule.useCameraPermission.mockReturnValue({ hasPermission: true, requestPermission: jest.fn() });
    Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Location.getLastKnownPositionAsync.mockResolvedValue({
      coords: { latitude: 11, longitude: 22 },
    });
    Location.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 11, longitude: 22 },
    });
    fetchRankedQuests.mockResolvedValue([]);
  });

  it('renders the shared camera controls before a photo is taken', async () => {
    const { findByTestId, getByTestId } = render(<QuickCaptureScreen />);

    await findByTestId('camera-shutter');
    await flushInitialEffects();
    expect(getByTestId('camera-lens-toggle')).toBeTruthy();
    expect(getByTestId('camera-flash-toggle')).toBeTruthy();
    expect(getByTestId('camera-shutter')).toBeTruthy();
  });

  it('defaults to create mode after a photo is captured', async () => {
    const { getByTestId } = render(<QuickCaptureScreen initialUri="file://mock.jpg" />);

    await flushInitialEffects();
    expect(getByTestId('quick-capture-mode-create')).toHaveAccessibilityState({ selected: true });
    expect(getByTestId('quick-capture-mode-existing')).toHaveAccessibilityState({ selected: false });
  });

  it('queues a new quest and navigates away optimistically without waiting for upload', async () => {
    enqueueNewChallengeUpload.mockResolvedValue({ id: 'queue-1' });
    waitForUploadQueueItem.mockResolvedValue({
      pinId: 'pin-1',
      pin: { created_by_handle: 'tester' },
    });

    const { getByPlaceholderText, getByTestId, getAllByText } = render(<QuickCaptureScreen initialUri="file://mock.jpg" />);

    await flushInitialEffects();
    fireEvent.press(getByTestId('quick-capture-mode-create'));
    await flushInitialEffects();
    fireEvent.changeText(getByPlaceholderText(/challenge prompt/i), '  hello world  ');
    // Mode toggle also renders 'Create'; the submit button is the last match
    const createButtons = getAllByText('Create');
    fireEvent.press(createButtons[createButtons.length - 1]);

    await waitFor(() => expect(enqueueNewChallengeUpload).toHaveBeenCalledWith({
      sourceUri: 'file://mock.jpg',
      message: 'hello world',
      location: { coords: { latitude: 11, longitude: 22 } },
      photoLocation: { coords: { latitude: 11, longitude: 22 } },
    }));
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/(tabs)/active_challenges'));
    expect(router.push).not.toHaveBeenCalled();
  });

  it('hides blocked ranked quests from the existing quest search results', async () => {
    fetchRankedQuests.mockResolvedValue([
      {
        _id: 'open-pin',
        message: 'Open quest',
        isGeoLocked: false,
        location: { latitude: 11, longitude: 22 },
      },
      {
        _id: 'blocked-pin',
        message: 'Blocked quest',
        isGeoLocked: true,
        location: { latitude: 44, longitude: 55 },
        upload_distance_meters: 80,
      },
    ]);

    const { getByTestId, getByText, queryByText } = render(<QuickCaptureScreen initialUri="file://mock.jpg" />);

    fireEvent.press(getByTestId('quick-capture-mode-existing'));

    await waitFor(() => expect(getByText('"Open quest"')).toBeTruthy());
    expect(queryByText('"Blocked quest"')).toBeNull();
  });
});
