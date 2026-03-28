import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import LoginScreen from '@/screens/LoginScreen';
import { AuthContext } from '@/hooks/AuthContext';

const mockAuthInstance = {
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  currentUser: { getIdToken: jest.fn(() => Promise.resolve('token-123')) },
};

jest.mock('@react-native-firebase/auth', () => {
  const mock = jest.fn(() => mockAuthInstance);
  return mock;
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })),
  addEventListener: jest.fn(() => jest.fn()),
}));

const auth = require('@react-native-firebase/auth');
const AsyncStorage = require('@react-native-async-storage/async-storage');
const NetInfo = require('@react-native-community/netinfo');

function renderWithContext(ui, contextOverrides = {}) {
  const defaultValue = {
    user: null,
    setUser: jest.fn(),
    profile: null,
    setProfile: jest.fn(),
    loadingAuth: false,
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

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth().signInWithEmailAndPassword.mockReset();
    auth().createUserWithEmailAndPassword.mockReset();
    auth().currentUser.getIdToken.mockReset();
    auth().currentUser.getIdToken.mockResolvedValue('token-123');
    NetInfo.fetch.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    NetInfo.addEventListener.mockImplementation(() => jest.fn());
  });

  it('logs in and stores token', async () => {
    auth().signInWithEmailAndPassword.mockResolvedValue({});
    auth().currentUser.getIdToken = jest.fn(() => Promise.resolve('token-abc'));

    const { getByPlaceholderText, getByText, getAllByText, contextValue } = renderWithContext(<LoginScreen />);

    await waitFor(() => expect(NetInfo.fetch).toHaveBeenCalled());

    fireEvent.press(getByText('Email'));
    fireEvent.press(getByText('Log in'));
    fireEvent.changeText(getByPlaceholderText(/Email/i), 'user@example.com');
    fireEvent.changeText(getByPlaceholderText(/Password/i), 'secret');
    fireEvent.press(getAllByText('Login').at(-1).parent);

    await waitFor(() =>
      expect(auth().signInWithEmailAndPassword).toHaveBeenCalledWith('user@example.com', 'secret')
    );
    expect(auth().currentUser.getIdToken).toHaveBeenCalled();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('user_token', 'token-abc');
    expect(contextValue.setUser).not.toHaveBeenCalled();
  });

  it('renders error when login fails', async () => {
    auth().signInWithEmailAndPassword.mockRejectedValue(new Error('Invalid credentials'));

    const { getByPlaceholderText, getByText, getAllByText, findByText } = renderWithContext(<LoginScreen />);

    await waitFor(() => expect(NetInfo.fetch).toHaveBeenCalled());

    fireEvent.press(getByText('Email'));
    fireEvent.press(getByText('Log in'));
    fireEvent.changeText(getByPlaceholderText(/Email/i), 'user@example.com');
    fireEvent.changeText(getByPlaceholderText(/Password/i), 'bad');
    fireEvent.press(getAllByText('Login').at(-1).parent);

    await findByText('Invalid credentials');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('shows an offline banner when network connectivity is unavailable', async () => {
    NetInfo.fetch.mockResolvedValue({ isConnected: false, isInternetReachable: false });

    const { findByText } = renderWithContext(<LoginScreen />);

    expect(await findByText('No network connection. Reconnect to continue.')).toBeTruthy();
  });
});
