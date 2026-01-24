import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import LoginScreen from '@/screens/LoginScreen';
import { AuthContext } from '@/hooks/AuthContext';

jest.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
}));

jest.mock('@/config/firebase', () => {
  const getIdToken = jest.fn(() => Promise.resolve('token-123'));
  return {
    auth: {
      currentUser: { getIdToken },
    },
  };
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
}));

const { signInWithEmailAndPassword } = require('firebase/auth');
const AsyncStorage = require('@react-native-async-storage/async-storage');
const { auth } = require('@/config/firebase');

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
  });

  it('logs in and stores token', async () => {
    signInWithEmailAndPassword.mockResolvedValue({});
    auth.currentUser.getIdToken = jest.fn(() => Promise.resolve('token-abc'));

    const { getByPlaceholderText, getByText, contextValue } = renderWithContext(<LoginScreen />);

    fireEvent.press(getByText('Email'));
    fireEvent.press(getByText('Log in'));
    fireEvent.changeText(getByPlaceholderText(/Email/i), 'user@example.com');
    fireEvent.changeText(getByPlaceholderText(/Password/i), 'secret');
    fireEvent.press(getByText('Login'));

    await waitFor(() => expect(signInWithEmailAndPassword).toHaveBeenCalledWith(auth, 'user@example.com', 'secret'));
    expect(auth.currentUser.getIdToken).toHaveBeenCalled();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('user_token', 'token-abc');
    expect(contextValue.setUser).toHaveBeenCalledWith({ token: 'token-abc' });
  });

  it('renders error when login fails', async () => {
    signInWithEmailAndPassword.mockRejectedValue(new Error('Invalid credentials'));

    const { getByPlaceholderText, getByText, findByText } = renderWithContext(<LoginScreen />);

    fireEvent.press(getByText('Email'));
    fireEvent.press(getByText('Log in'));
    fireEvent.changeText(getByPlaceholderText(/Email/i), 'user@example.com');
    fireEvent.changeText(getByPlaceholderText(/Password/i), 'bad');
    fireEvent.press(getByText('Login'));

    await findByText('Invalid credentials');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});
