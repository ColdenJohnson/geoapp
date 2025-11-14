import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { AuthContext, AuthProvider } from '../AuthContext';

jest.mock('@/lib/api', () => ({
  fetchUsersByUID: jest.fn(),
}));

const { fetchUsersByUID } = require('@/lib/api');

describe('AuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads profile when user with uid is set and clears when unset', async () => {
    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
    fetchUsersByUID.mockResolvedValue({ uid: 'abc', name: 'Jane' });

    const { result } = renderHook(() => React.useContext(AuthContext), { wrapper });

    expect(result.current.profile).toBeNull();

    await act(async () => {
      result.current.setUser({ uid: 'abc' });
    });

    expect(fetchUsersByUID).toHaveBeenCalledWith('abc');
    expect(result.current.profile).toEqual({ uid: 'abc', name: 'Jane' });

    await act(async () => {
      result.current.setUser(null);
    });

    expect(result.current.profile).toBeNull();
  });
});
