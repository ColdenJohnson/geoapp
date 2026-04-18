import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockApi = {
  searchUserByHandle: jest.fn(),
  setUserHandle: jest.fn(),
  updateUserProfile: jest.fn(),
};

const mockAuthInstance = {
  signOut: jest.fn(),
};

jest.mock('@/lib/api', () => mockApi);

jest.mock('@react-native-firebase/auth', () => jest.fn(() => mockAuthInstance));

jest.mock('@react-native-async-storage/async-storage', () => ({
  removeItem: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    SafeAreaView: ({ children, style }) => <View style={style}>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('@expo/vector-icons/FontAwesome', () => {
  const React = require('react');
  return () => null;
});

const CreateUsernameScreen = require('@/screens/CreateUsernameScreen').default;
const { AuthContext } = require('@/hooks/AuthContext');

function renderWithContext(ui, contextOverrides = {}) {
  const defaultValue = {
    user: { uid: 'uid-1' },
    setUser: jest.fn(),
    profile: null,
    setProfile: jest.fn(),
    loadingAuth: false,
    loadingProfile: false,
  };

  const value = { ...defaultValue, ...contextOverrides };

  return {
    ...render(
      <AuthContext.Provider value={value}>
        {ui}
      </AuthContext.Provider>
    ),
    contextValue: value,
  };
}

describe('CreateUsernameScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockApi.searchUserByHandle.mockResolvedValue([]);
    mockApi.setUserHandle.mockResolvedValue({ success: true, handle: 'fresh_handle' });
    mockApi.updateUserProfile.mockResolvedValue({ _id: 'uid-1', handle: 'fresh_handle', display_name: 'fresh_handle' });
    mockAuthInstance.signOut.mockResolvedValue();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('blocks invalid handles on the client before checking availability', async () => {
    const { getByTestId, findByText } = renderWithContext(<CreateUsernameScreen />);

    fireEvent.changeText(getByTestId('create-username-input'), 'bad handle');

    expect(await findByText('Handle must be 3-20 letters, numbers, or underscores.')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(mockApi.searchUserByHandle).not.toHaveBeenCalled();
  });

  it('shows a taken message and keeps continue disabled when another user owns the handle', async () => {
    mockApi.searchUserByHandle.mockResolvedValue([{ uid: 'other-user', handle: 'taken_name' }]);

    const { getByTestId, findByText, getByText } = renderWithContext(<CreateUsernameScreen />);

    fireEvent.changeText(getByTestId('create-username-input'), 'taken_name');

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(await findByText('That handle is already taken.')).toBeTruthy();

    fireEvent.press(getByText('Continue').parent);
    expect(mockApi.setUserHandle).not.toHaveBeenCalled();
  });

  it('saves the handle and display name once the handle is available', async () => {
    mockApi.searchUserByHandle.mockResolvedValue([]);
    mockApi.setUserHandle.mockResolvedValue({ success: true, handle: 'fresh_handle' });
    mockApi.updateUserProfile.mockResolvedValue({ _id: 'uid-1', handle: 'fresh_handle', display_name: 'fresh_handle' });

    const { getByTestId, findByText, getByText, contextValue } = renderWithContext(<CreateUsernameScreen />);

    fireEvent.changeText(getByTestId('create-username-input'), 'fresh_handle');

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(await findByText('Handle available.')).toBeTruthy();

    fireEvent.press(getByText('Continue').parent);

    await waitFor(() => expect(mockApi.setUserHandle).toHaveBeenCalledWith('fresh_handle'));
    await waitFor(() => expect(mockApi.updateUserProfile).toHaveBeenCalledWith('uid-1', { display_name: 'fresh_handle' }));
    expect(contextValue.setProfile).toHaveBeenCalledWith({
      _id: 'uid-1',
      handle: 'fresh_handle',
      display_name: 'fresh_handle',
    });
  });
});
