import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })),
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => {}),
  selectionAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('@/lib/api', () => ({
  fetchRankedQuests: jest.fn(),
  fetchSavedQuests: jest.fn(),
  saveQuest: jest.fn(async () => ({ success: true })),
  unsaveQuest: jest.fn(async () => ({ success: true })),
}));

jest.mock('@/lib/apiClient', () => ({
  PUBLIC_BASE_URL: 'https://example.com',
}));

jest.mock('@/hooks/usePalette', () => ({
  usePalette: () => ({
    surface: '#f5f5f5',
    bg: '#ffffff',
    border: '#d0d0d0',
    text: '#111111',
    textMuted: '#666666',
    primary: '#ff6b35',
    primary_darkened: '#d94f1f',
    primaryTextOn: '#ffffff',
    danger: '#dc2626',
  }),
}));

jest.mock('@/components/ui/TabBarBackground', () => ({
  useBottomTabOverflow: () => 0,
}));

jest.mock('@/components/ui/PressHoldActionMenu', () => ({
  PressHoldActionMenu: () => null,
  PRESS_HOLD_ACTION_MENU_DEFAULT_SIZE: { width: 240, height: 180 },
  getPressHoldActionMenuOptionAtPoint: jest.fn(() => null),
  getPressHoldActionMenuPosition: jest.fn(() => ({ top: 0, left: 0 })),
}));

jest.mock('@/components/ui/Toast', () => ({
  Toast: () => null,
  useToast: () => ({ message: null, show: jest.fn() }),
}));

jest.mock('@/hooks/AuthContext', () => {
  const React = require('react');
  return {
    AuthContext: React.createContext({ user: { uid: 'user-1' } }),
  };
});

jest.mock('@/lib/pinChallengeCache', () => ({
  readPinCommentsCache: jest.fn(async () => ({ comments: [], hadCache: false, isFresh: false })),
}));

jest.mock('@/lib/photoCommentRanking', () => ({
  getTopRankedPhotoComment: jest.fn(() => null),
}));

const { fetchRankedQuests, fetchSavedQuests } = require('@/lib/api');
const { saveQuest } = require('@/lib/api');
const { unsaveQuest } = require('@/lib/api');
const AsyncStorage = require('@react-native-async-storage/async-storage');
const NetInfo = require('@react-native-community/netinfo');
const { AuthContext } = require('@/hooks/AuthContext');
const {
  default: ActiveChallengesScreen,
  mergeRefreshedChallengesWithSessionQueue,
} = require('@/app/(tabs)/active_challenges');

function renderScreen(contextOverrides = {}) {
  const defaultValue = {
    user: { uid: 'user-1' },
  };

  return render(
    <AuthContext.Provider value={{ ...defaultValue, ...contextOverrides }}>
      <ActiveChallengesScreen />
    </AuthContext.Provider>
  );
}

function createCachedChallenge(pinId, prompt) {
  return {
    pinId,
    prompt,
    creatorHandle: `@${pinId}`,
    creatorHandleRaw: pinId,
    featuredPhotoHandle: `@${pinId}`,
    creatorName: `${pinId} user`,
    uploadsCount: 2,
    teaserPhoto: null,
    teaserPhotoId: null,
    teaserTopComment: null,
    friendParticipantCount: 0,
    isSaved: false,
  };
}

describe('ActiveChallengesScreen search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.getItem.mockResolvedValue(null);
    AsyncStorage.setItem.mockResolvedValue();
    NetInfo.fetch.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    NetInfo.addEventListener.mockImplementation(() => jest.fn());
    fetchSavedQuests.mockResolvedValue([]);
    fetchRankedQuests.mockResolvedValue([
      {
        _id: 'quest-1',
        message: 'Cat quest',
        created_by_handle: 'maker',
        created_by_name: 'Maker',
        photo_count: 3,
      },
      {
        _id: 'quest-2',
        message: 'AB non-location locked',
        created_by_handle: 'maker',
        created_by_name: 'Maker',
        photo_count: 5,
      },
    ]);
  });

  it('filters immediately at three characters and can manually search shorter queries', async () => {
    const { getByTestId, queryByText } = renderScreen();

    await waitFor(() => expect(queryByText(/Cat quest/)).toBeTruthy());
    expect(queryByText(/AB non-location locked/)).toBeTruthy();

    const searchInput = getByTestId('quest-search-input');
    fireEvent.changeText(searchInput, 'ab');

    expect(queryByText(/Cat quest/)).toBeTruthy();
    expect(queryByText(/AB non-location locked/)).toBeTruthy();

    fireEvent.press(getByTestId('quest-search-button'));

    await waitFor(() => expect(queryByText(/Cat quest/)).toBeNull());
    expect(queryByText(/AB non-location locked/)).toBeTruthy();

    fireEvent.changeText(searchInput, '');

    await waitFor(() => expect(queryByText(/Cat quest/)).toBeTruthy());

    fireEvent.changeText(searchInput, 'xyz');

    await waitFor(() => expect(queryByText(/No quests found for that search./)).toBeTruthy());
  });

  it('toggles the active quest saved state from the card save button', async () => {
    const { getByTestId, queryByText } = renderScreen();

    await waitFor(() => expect(queryByText(/Cat quest/)).toBeTruthy());

    fireEvent.press(getByTestId('quest-card-save-button-quest-1'));

    await waitFor(() => expect(saveQuest).toHaveBeenCalledWith('quest-1'));

    fireEvent.press(getByTestId('quest-card-save-button-quest-1'));

    await waitFor(() => expect(unsaveQuest).toHaveBeenCalledWith('quest-1'));
  });

  it('shows and clears the saved quests hint dot after a save', async () => {
    const { getByTestId, queryByTestId, queryByText } = renderScreen();

    await waitFor(() => expect(queryByText(/Cat quest/)).toBeTruthy());
    expect(queryByTestId('quest-saved-queue-dot')).toBeNull();

    fireEvent.press(getByTestId('quest-card-save-button-quest-1'));

    await waitFor(() => expect(saveQuest).toHaveBeenCalledWith('quest-1'));
    expect(queryByTestId('quest-saved-queue-dot')).toBeTruthy();

    fireEvent.press(getByTestId('quest-saved-queue-button'));

    await waitFor(() => expect(queryByTestId('quest-saved-queue-dot')).toBeNull());
  });

  it('renders cached quests before the fresh network response resolves', async () => {
    AsyncStorage.getItem.mockResolvedValue(JSON.stringify({
      challenges: [
        {
          pinId: 'cached-quest-1',
          prompt: 'Cached quest',
          creatorHandle: '@cached',
          creatorHandleRaw: 'cached',
          featuredPhotoHandle: '@cached',
          creatorName: 'Cached User',
          uploadsCount: 2,
          teaserPhoto: null,
          teaserPhotoId: null,
          teaserTopComment: null,
          friendParticipantCount: 0,
          isSaved: false,
        },
      ],
      fetchedAt: Date.now(),
    }));

    let resolveRankedQuests;
    fetchRankedQuests.mockImplementation(() => new Promise((resolve) => {
      resolveRankedQuests = resolve;
    }));

    const { queryByText } = renderScreen({ user: { uid: 'user-cached' } });

    await waitFor(() => expect(queryByText(/Cached quest/)).toBeTruthy());
    expect(queryByText(/Fresh quest/)).toBeNull();

    resolveRankedQuests([
      {
        _id: 'fresh-quest-1',
        message: 'Fresh quest',
        created_by_handle: 'fresh',
        created_by_name: 'Fresh User',
        photo_count: 4,
      },
    ]);

    await waitFor(() => expect(queryByText(/Fresh quest/)).toBeTruthy());
    expect(AsyncStorage.setItem).toHaveBeenCalled();
  });

  it('shows an offline banner while displaying cached quests', async () => {
    AsyncStorage.getItem.mockResolvedValue(JSON.stringify({
      challenges: [
        createCachedChallenge('cached-quest-1', 'Cached quest'),
      ],
      fetchedAt: Date.now(),
    }));
    NetInfo.fetch.mockResolvedValue({ isConnected: false, isInternetReachable: false });

    const { findByText } = renderScreen({ user: { uid: 'user-offline' } });

    expect(await findByText('Offline mode. Quests may be outdated.')).toBeTruthy();
  });

  it('preserves the visible stack while keeping deferred quests at the back on refresh', () => {
    const currentChallenges = [
      createCachedChallenge('cached-quest-2', 'Cached quest 2'),
      createCachedChallenge('cached-quest-3', 'Cached quest 3'),
      createCachedChallenge('cached-quest-4', 'Cached quest 4'),
      createCachedChallenge('cached-quest-1', 'Cached quest 1'),
    ];
    const freshChallenges = [
      createCachedChallenge('fresh-top', 'Fresh top quest'),
      createCachedChallenge('cached-quest-1', 'Cached quest 1'),
      createCachedChallenge('cached-quest-2', 'Cached quest 2'),
      createCachedChallenge('cached-quest-3', 'Cached quest 3'),
      createCachedChallenge('cached-quest-4', 'Cached quest 4'),
    ];

    const { challenges, deferredPinIds } = mergeRefreshedChallengesWithSessionQueue(
      currentChallenges,
      freshChallenges,
      ['cached-quest-1']
    );

    expect(challenges.map((challenge) => challenge.pinId)).toEqual([
      'cached-quest-2',
      'cached-quest-3',
      'cached-quest-4',
      'fresh-top',
      'cached-quest-1',
    ]);
    expect(deferredPinIds).toEqual(['cached-quest-1']);
  });

  it('persists canonical backend order to cache instead of the local deferred queue', async () => {
    AsyncStorage.getItem.mockResolvedValue(JSON.stringify({
      challenges: [
        createCachedChallenge('cached-quest-1', 'Cached quest 1'),
        createCachedChallenge('cached-quest-2', 'Cached quest 2'),
        createCachedChallenge('cached-quest-3', 'Cached quest 3'),
        createCachedChallenge('cached-quest-4', 'Cached quest 4'),
      ],
      fetchedAt: Date.now(),
    }));

    fetchRankedQuests.mockResolvedValue([
      {
        _id: 'fresh-top',
        message: 'Fresh top quest',
        created_by_handle: 'fresh',
        created_by_name: 'Fresh User',
        photo_count: 6,
      },
      {
        _id: 'cached-quest-1',
        message: 'Cached quest 1',
        created_by_handle: 'cached-quest-1',
        created_by_name: 'cached-quest-1 user',
        photo_count: 2,
      },
      {
        _id: 'cached-quest-2',
        message: 'Cached quest 2',
        created_by_handle: 'cached-quest-2',
        created_by_name: 'cached-quest-2 user',
        photo_count: 2,
      },
      {
        _id: 'cached-quest-3',
        message: 'Cached quest 3',
        created_by_handle: 'cached-quest-3',
        created_by_name: 'cached-quest-3 user',
        photo_count: 2,
      },
      {
        _id: 'cached-quest-4',
        message: 'Cached quest 4',
        created_by_handle: 'cached-quest-4',
        created_by_name: 'cached-quest-4 user',
        photo_count: 2,
      },
    ]);

    renderScreen({ user: { uid: 'user-session-merge' } });

    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalled());

    const rankedQuestCacheWrite = AsyncStorage.setItem.mock.calls.find(
      ([key]) => key === 'ranked_quests_cache_user-session-merge'
    );
    expect(rankedQuestCacheWrite).toBeTruthy();

    const persistedPayload = JSON.parse(rankedQuestCacheWrite[1]);
    expect(persistedPayload.challenges.map((challenge) => challenge.pinId)).toEqual([
      'fresh-top',
      'cached-quest-1',
      'cached-quest-2',
      'cached-quest-3',
      'cached-quest-4',
    ]);
  });
});
