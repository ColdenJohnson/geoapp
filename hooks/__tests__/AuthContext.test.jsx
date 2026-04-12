import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { APP_TUTORIAL_STEPS, AuthContext, AuthProvider } from '../AuthContext';

const mockAuthState = {
  currentUser: null,
  onAuthStateChanged: jest.fn((callback) => {
    callback(null);
    return jest.fn();
  }),
  onIdTokenChanged: jest.fn(() => jest.fn()),
};

jest.mock('@react-native-firebase/auth', () => {
  return jest.fn(() => mockAuthState);
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('@/lib/api', () => ({
  fetchUsersByUID: jest.fn(),
  fetchFriends: jest.fn(() => Promise.resolve([])),
  fetchFriendRequests: jest.fn(() => Promise.resolve({ incoming: [], outgoing: [] })),
  fetchFriendActivity: jest.fn(() => Promise.resolve({ items: [], suggestions: [], nextCursor: null })),
  fetchUserStats: jest.fn(() => Promise.resolve(null)),
  fetchUserTopPhotos: jest.fn(() => Promise.resolve([])),
}));

const { fetchUsersByUID } = require('@/lib/api');
const AsyncStorage = require('@react-native-async-storage/async-storage');
describe('AuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.currentUser = null;
    AsyncStorage.getItem.mockResolvedValue(null);
    AsyncStorage.setItem.mockResolvedValue();
    AsyncStorage.removeItem.mockResolvedValue();
    delete process.env.EXPO_PUBLIC_FORCE_APP_TUTORIAL;
    delete process.env.EXPO_PUBLIC_FORCE_APP_TUTORIAL_STEP;
    delete global.__DEV_FORCE_APP_TUTORIAL__;
    delete global.__DEV_FORCE_APP_TUTORIAL_STEP__;
  });

  it('loads profile when user with uid is set and clears when unset', async () => {
    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
    fetchUsersByUID.mockResolvedValue({ uid: 'abc', name: 'Jane', theme_preference: 'light' });

    const { result } = renderHook(() => React.useContext(AuthContext), { wrapper });

    expect(result.current.profile).toBeNull();
    expect(result.current.themePreference).toBe('dark');

    await act(async () => {
      result.current.setUser({ uid: 'abc' });
    });

    expect(fetchUsersByUID).toHaveBeenCalledWith('abc');
    expect(result.current.profile).toEqual({ uid: 'abc', name: 'Jane', theme_preference: 'light' });
    expect(result.current.themePreference).toBe('light');

    await act(async () => {
      result.current.setUser(null);
    });

    expect(result.current.profile).toBeNull();
    expect(result.current.themePreference).toBe('dark');
  });

  it('shows the friends tab dot on session start and clears it when marked seen', async () => {
    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
    fetchUsersByUID.mockResolvedValue({ uid: 'abc', name: 'Jane', theme_preference: 'light' });

    const { result } = renderHook(() => React.useContext(AuthContext), { wrapper });

    expect(result.current.hasUnseenFriendActivity).toBe(false);

    await act(async () => {
      mockAuthState.currentUser = { uid: 'abc', metadata: {} };
      result.current.setUser({ uid: 'abc' });
    });

    await waitFor(() => expect(result.current.hasUnseenFriendActivity).toBe(true));

    act(() => {
      result.current.markFriendActivitySeen();
    });

    expect(result.current.hasUnseenFriendActivity).toBe(false);
  });

  it('shows the tutorial by default when no seen flag exists', async () => {
    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
    fetchUsersByUID.mockResolvedValue({ uid: 'abc', name: 'Jane', theme_preference: 'light' });

    const { result } = renderHook(() => React.useContext(AuthContext), { wrapper });

    await act(async () => {
      result.current.setUser({ uid: 'abc' });
    });

    await waitFor(() => {
      expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.QUESTS_TAB)).toBe(true);
      expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.MAP_CREATE)).toBe(true);
      expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.PROFILE_EDIT)).toBe(true);
    });
  });

  it('does not show the tutorial when the seen flag already exists', async () => {
    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
    fetchUsersByUID.mockResolvedValue({ uid: 'abc', name: 'Jane', theme_preference: 'light' });
    AsyncStorage.getItem.mockImplementation((key) => Promise.resolve(
      key === 'app_tutorial_seen_abc' ? 'true' : null
    ));

    const { result } = renderHook(() => React.useContext(AuthContext), { wrapper });

    await act(async () => {
      result.current.setUser({ uid: 'abc' });
    });

    expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.QUESTS_TAB)).toBe(false);
    expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.MAP_CREATE)).toBe(false);
    expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.PROFILE_EDIT)).toBe(false);
  });

  it('marks the tutorial seen when completed', async () => {
    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
    fetchUsersByUID.mockResolvedValue({ uid: 'abc', name: 'Jane', theme_preference: 'light' });

    const { result } = renderHook(() => React.useContext(AuthContext), { wrapper });

    await act(async () => {
      result.current.setUser({ uid: 'abc' });
    });

    await waitFor(() => {
      expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.QUESTS_TAB)).toBe(true);
      expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.MAP_CREATE)).toBe(true);
      expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.PROFILE_EDIT)).toBe(true);
    });

    await act(async () => {
      await result.current.advanceAppTutorial(APP_TUTORIAL_STEPS.QUESTS_TAB);
    });
    expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.QUESTS_TAB)).toBe(false);
    expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.MAP_CREATE)).toBe(true);

    await act(async () => {
      await result.current.advanceAppTutorial(APP_TUTORIAL_STEPS.MAP_CREATE);
    });
    expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.MAP_CREATE)).toBe(false);

    await act(async () => {
      await result.current.advanceAppTutorial(APP_TUTORIAL_STEPS.FRIENDS_ADD);
    });
    expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.FRIENDS_ADD)).toBe(false);
    expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.PROFILE_EDIT)).toBe(true);

    await act(async () => {
      await result.current.advanceAppTutorial(APP_TUTORIAL_STEPS.PROFILE_EDIT);
    });

    expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.PROFILE_EDIT)).toBe(false);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('app_tutorial_seen_abc', 'true');
  });

  it('keeps map and profile tutorial dismissal untethered when reusing an older callback', async () => {
    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
    fetchUsersByUID.mockResolvedValue({ uid: 'abc', name: 'Jane', theme_preference: 'light' });

    const { result } = renderHook(() => React.useContext(AuthContext), { wrapper });

    await act(async () => {
      result.current.setUser({ uid: 'abc' });
    });

    await waitFor(() => {
      expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.MAP_CREATE)).toBe(true);
      expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.PROFILE_EDIT)).toBe(true);
    });

    const initialAdvanceAppTutorial = result.current.advanceAppTutorial;

    await act(async () => {
      await initialAdvanceAppTutorial(APP_TUTORIAL_STEPS.MAP_CREATE);
    });

    expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.MAP_CREATE)).toBe(false);
    expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.PROFILE_EDIT)).toBe(true);

    await act(async () => {
      await initialAdvanceAppTutorial(APP_TUTORIAL_STEPS.PROFILE_EDIT);
    });

    expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.MAP_CREATE)).toBe(false);
    expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.PROFILE_EDIT)).toBe(false);
  });

  it('forces the tutorial walkthrough when the dev flag is enabled', async () => {
    global.__DEV_FORCE_APP_TUTORIAL__ = true;

    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
    fetchUsersByUID.mockResolvedValue({ uid: 'abc', name: 'Jane', theme_preference: 'light' });

    const { result } = renderHook(() => React.useContext(AuthContext), { wrapper });

    await act(async () => {
      result.current.setUser({ uid: 'abc' });
    });

    await waitFor(() => {
      expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.QUESTS_TAB)).toBe(true);
      expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.MAP_CREATE)).toBe(true);
      expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.PROFILE_EDIT)).toBe(true);
    });

    await act(async () => {
      await result.current.advanceAppTutorial(APP_TUTORIAL_STEPS.QUESTS_TAB);
    });

    expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.QUESTS_TAB)).toBe(false);
    expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.MAP_CREATE)).toBe(true);
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith('app_tutorial_seen_abc', 'true');
  });

  it('forces a specific app tutorial step from env', async () => {
    global.__DEV_FORCE_APP_TUTORIAL_STEP__ = 'profile_edit';

    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
    fetchUsersByUID.mockResolvedValue({ uid: 'abc', name: 'Jane', theme_preference: 'light' });

    const { result } = renderHook(() => React.useContext(AuthContext), { wrapper });

    await act(async () => {
      result.current.setUser({ uid: 'abc' });
    });

    await waitFor(() => {
      expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.PROFILE_EDIT)).toBe(true);
      expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.QUESTS_TAB)).toBe(false);
      expect(result.current.isAppTutorialStepVisible(APP_TUTORIAL_STEPS.MAP_CREATE)).toBe(false);
    });
  });
});
