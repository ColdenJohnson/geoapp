import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import LoginScreen from '@/screens/LoginScreen';
import { AuthContext } from '@/hooks/AuthContext';

const mockConfirmation = {
  confirm: jest.fn(),
};

const mockAuthInstance = {
  signInWithEmailAndPassword: jest.fn(),
  signInWithPhoneNumber: jest.fn(),
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

jest.mock('react-native-country-picker-modal', () => {
  const React = require('react');
  const MockCountryPicker = () => null;
  return {
    __esModule: true,
    default: MockCountryPicker,
    DARK_THEME: {},
    DEFAULT_THEME: {},
  };
});

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
    mockConfirmation.confirm.mockReset();
    auth().signInWithEmailAndPassword.mockReset();
    auth().signInWithPhoneNumber.mockReset();
    auth().currentUser.getIdToken.mockReset();
    auth().currentUser.getIdToken.mockResolvedValue('token-123');
    NetInfo.fetch.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    NetInfo.addEventListener.mockImplementation(() => jest.fn());
  });

  it('starts on phone entry and only advances after a successful SMS request', async () => {
    auth().signInWithPhoneNumber.mockResolvedValue(mockConfirmation);

    const { getByTestId, getByText, queryByText } = renderWithContext(<LoginScreen />);

    await waitFor(() => expect(NetInfo.fetch).toHaveBeenCalled());

    fireEvent.changeText(getByTestId('phone-number-input'), '123');
    fireEvent.press(getByText('Send verification text').parent);
    expect(auth().signInWithPhoneNumber).not.toHaveBeenCalled();
    expect(queryByText('Verify your phone number')).toBeNull();

    fireEvent.changeText(getByTestId('phone-number-input'), '4155552671');
    fireEvent.press(getByText('Send verification text').parent);

    await waitFor(() =>
      expect(auth().signInWithPhoneNumber).toHaveBeenCalledWith('+14155552671')
    );
    expect(getByText('Verify your phone number')).toBeTruthy();
  });

  it('stays on the phone screen and renders an inline error when SMS sending fails', async () => {
    auth().signInWithPhoneNumber.mockRejectedValue(new Error('Unable to send text'));

    const { getByTestId, getByText, findByText, queryByText } = renderWithContext(<LoginScreen />);

    await waitFor(() => expect(NetInfo.fetch).toHaveBeenCalled());

    fireEvent.changeText(getByTestId('phone-number-input'), '4155552671');
    fireEvent.press(getByText('Send verification text').parent);

    expect(await findByText('Unable to send text')).toBeTruthy();
    expect(queryByText('Verify your phone number')).toBeNull();
  });

  it('auto-confirms the code and stores the auth token once 6 digits are entered', async () => {
    auth().signInWithPhoneNumber.mockResolvedValue(mockConfirmation);
    mockConfirmation.confirm.mockResolvedValue({});
    auth().currentUser.getIdToken.mockResolvedValue('token-abc');

    const { getByTestId, getByText } = renderWithContext(<LoginScreen />);

    await waitFor(() => expect(NetInfo.fetch).toHaveBeenCalled());

    fireEvent.changeText(getByTestId('phone-number-input'), '4155552671');
    fireEvent.press(getByText('Send verification text').parent);

    await waitFor(() => expect(getByText('Verify your phone number')).toBeTruthy());

    fireEvent.changeText(getByTestId('sms-code-input'), '12345');
    expect(mockConfirmation.confirm).not.toHaveBeenCalled();

    fireEvent.changeText(getByTestId('sms-code-input'), '123456');

    await waitFor(() => expect(mockConfirmation.confirm).toHaveBeenCalledWith('123456'));
    expect(auth().currentUser.getIdToken).toHaveBeenCalled();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('user_token', 'token-abc');
  });

  it('supports the email fallback login path', async () => {
    auth().signInWithEmailAndPassword.mockResolvedValue({});
    auth().currentUser.getIdToken.mockResolvedValue('token-email');

    const { getByTestId, getByText } = renderWithContext(<LoginScreen />);

    await waitFor(() => expect(NetInfo.fetch).toHaveBeenCalled());

    fireEvent.press(getByText('I need to log in with email'));
    fireEvent.changeText(getByTestId('email-input'), 'user@example.com');
    fireEvent.changeText(getByTestId('password-input'), 'secret');
    fireEvent.press(getByText('Log In').parent);

    await waitFor(() =>
      expect(auth().signInWithEmailAndPassword).toHaveBeenCalledWith('user@example.com', 'secret')
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('user_token', 'token-email');
  });

  it('shows an offline banner when network connectivity is unavailable', async () => {
    NetInfo.fetch.mockResolvedValue({ isConnected: false, isInternetReachable: false });

    const { findByText } = renderWithContext(<LoginScreen />);

    expect(await findByText('No network connection. Reconnect to continue.')).toBeTruthy();
  });
});
