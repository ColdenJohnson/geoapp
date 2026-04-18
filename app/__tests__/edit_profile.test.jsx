import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import EditProfileScreen from '@/app/edit_profile';
import { AuthContext } from '@/hooks/AuthContext';

jest.mock('@/lib/api', () => ({
  updateUserProfile: jest.fn(async (_uid, updates) => ({ _id: 'user-1', ...updates })),
  setUserHandle: jest.fn(async (handle) => ({ success: true, handle })),
  deleteMyAccount: jest.fn(async () => ({ success: true })),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  removeItem: jest.fn(async () => {}),
}));

jest.mock('@react-native-firebase/auth', () => () => ({
  onAuthStateChanged: jest.fn(() => jest.fn()),
  onIdTokenChanged: jest.fn(() => jest.fn()),
  signOut: jest.fn(async () => {}),
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
  MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('@react-native-firebase/storage', () => () => ({
  ref: () => ({
    put: jest.fn(async () => {}),
    getDownloadURL: jest.fn(async () => 'https://example.com/photo.jpg'),
  }),
}));

const { router } = require('expo-router');
const { setUserHandle, updateUserProfile } = require('@/lib/api');

function renderScreen(overrides = {}) {
  const themePreference = overrides.themePreference || overrides.profile?.theme_preference || 'dark';
  const value = {
    user: { uid: 'user-1' },
    profile: {
      handle: 'valid_name',
      display_name: 'Tester',
      bio: 'Hello',
      default_pin_private: false,
      theme_preference: themePreference,
      ...overrides.profile,
    },
    themePreference,
    setProfile: jest.fn(),
    setUser: jest.fn(),
  };

  return render(
    <AuthContext.Provider value={value}>
      <EditProfileScreen />
    </AuthContext.Provider>
  );
}

describe('EditProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    router.back.mockClear();
  });

  it('blocks invalid handles on the client', () => {
    const { getByDisplayValue, getByText } = renderScreen();

    fireEvent.changeText(getByDisplayValue('valid_name'), 'bad handle');

    expect(getByText('Handle must be 3-20 letters, numbers, or underscores.')).toBeTruthy();

    fireEvent.press(getByText('Save'));

    expect(router.back).not.toHaveBeenCalled();
    expect(setUserHandle).not.toHaveBeenCalled();
  });

  it('saves and exits when the handle is valid', async () => {
    const { getByDisplayValue, getByText } = renderScreen();

    fireEvent.changeText(getByDisplayValue('valid_name'), 'valid_name_2');
    fireEvent.press(getByText('Save'));

    expect(router.back).toHaveBeenCalled();
    await waitFor(() => expect(setUserHandle).toHaveBeenCalledWith('valid_name_2'));
  });

  it('persists theme preference changes immediately', async () => {
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Light'));

    await waitFor(() => expect(updateUserProfile).toHaveBeenCalledWith('user-1', { theme_preference: 'light' }));
  });
});
