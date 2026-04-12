import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockShowToast = jest.fn();

jest.mock('@/hooks/AuthContext', () => {
  const React = require('react');
  return {
    AuthContext: React.createContext({}),
    APP_TUTORIAL_STEPS: {
      QUESTS_TAB: 'quests_tab',
      MAP_CREATE: 'map_create',
      FRIENDS_ADD: 'friends_add',
      PROFILE_EDIT: 'profile_edit',
      COMPLETED: 'completed',
      NOT_ELIGIBLE: 'not_eligible',
    },
  };
});

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (callback) => {
      React.useEffect(() => callback(), [callback]);
    },
  };
});

jest.mock('@/hooks/usePalette', () => ({
  usePalette: () => ({
    surface: '#f5f5f5',
    bg: '#ffffff',
    border: '#d0d0d0',
    text: '#111111',
    textMuted: '#666666',
    primary: '#ff6b35',
    primaryTextOn: '#ffffff',
  }),
}));

jest.mock('@/lib/api', () => ({
  acceptFriendRequest: jest.fn(async () => ({ success: true })),
  cancelFriendRequest: jest.fn(async () => ({ success: true })),
  rejectFriendRequest: jest.fn(async () => ({ success: true })),
  requestFriend: jest.fn(async () => ({ success: true })),
  searchUserByHandle: jest.fn(async () => []),
}));

jest.mock('@/components/ui/Toast', () => ({
  Toast: () => null,
  useToast: () => ({ message: null, show: mockShowToast }),
}));

import { cancelFriendRequest } from '@/lib/api';
import FriendsTabScreen from '@/app/(tabs)/friends_tab';
import { AuthContext } from '@/hooks/AuthContext';

function renderScreen(overrides = {}) {
  const value = {
    friends: [],
    friendRequests: { incoming: [], outgoing: [] },
    friendsLoading: false,
    markFriendActivitySeen: jest.fn(),
    refreshFriends: jest.fn(async () => []),
    refreshFriendRequests: jest.fn(async () => ({ incoming: [], outgoing: [] })),
    friendActivityItems: [],
    friendActivitySuggestions: [],
    friendActivityLoading: false,
    friendActivityLoadingMore: false,
    friendActivityFetchedAt: Date.now(),
    refreshFriendActivity: jest.fn(async () => ({ items: [], suggestions: [], nextCursor: null })),
    loadMoreFriendActivity: jest.fn(),
    appTutorialStep: null,
    isAppTutorialStepVisible: jest.fn(() => false),
    advanceAppTutorial: jest.fn(),
    ...overrides,
  };

  return render(
    <AuthContext.Provider value={value}>
      <FriendsTabScreen />
    </AuthContext.Provider>
  );
}

describe('FriendsTabScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows a toast when a geo-locked activity card is tapped', () => {
    const activityItem = {
      id: 'activity-1',
      actor_uid: 'friend-1',
      actor_display_name: 'Friend',
      actor_handle: 'friend',
      pin_id: 'pin-1',
      challenge_prompt: 'Locked quest',
      challenge_is_geo_locked: true,
      can_open: false,
      created_at: '2026-04-07T00:00:00.000Z',
    };

    const { getByText } = renderScreen({
      friendActivityItems: [activityItem],
    });

    fireEvent.press(getByText('Locked quest'));

    expect(mockShowToast).toHaveBeenCalledWith(
      'Unable to open this activity because it is location locked.',
      2500
    );
  });

  it('clears the tab dot when the friends tab is focused', () => {
    const markFriendActivitySeen = jest.fn();

    renderScreen({
      markFriendActivitySeen,
    });

    expect(markFriendActivitySeen).toHaveBeenCalled();
  });

  it('removes an outgoing request optimistically when cancel is pressed', async () => {
    let resolveCancel;
    cancelFriendRequest.mockImplementationOnce(() => new Promise((resolve) => {
      resolveCancel = resolve;
    }));
    const refreshFriendRequests = jest.fn(async () => ({ incoming: [], outgoing: [] }));

    const { getAllByText, getByText, queryByText } = renderScreen({
      friendRequests: {
        incoming: [],
        outgoing: [{
          uid: 'outgoing-1',
          display_name: 'Outgoing Friend',
          handle: 'outgoing_friend',
          requested_at: '2026-04-07T00:00:00.000Z',
        }],
      },
      refreshFriendRequests,
    });

    fireEvent.press(getAllByText('Friends')[1]);

    expect(getByText('Outgoing Friend')).toBeTruthy();

    fireEvent.press(getByText('Cancel'));

    expect(queryByText('Outgoing Friend')).toBeNull();
    expect(getByText('No outgoing requests.')).toBeTruthy();

    await act(async () => {
      resolveCancel({ success: true });
    });

    await waitFor(() => {
      expect(refreshFriendRequests).toHaveBeenCalledWith({ force: true });
    });
  });
});
