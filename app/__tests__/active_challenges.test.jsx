import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

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

jest.mock('@/lib/pinChallengeCache', () => ({
  readPinCommentsCache: jest.fn(async () => ({ comments: [], hadCache: false, isFresh: false })),
}));

jest.mock('@/lib/photoCommentRanking', () => ({
  getTopRankedPhotoComment: jest.fn(() => null),
}));

const { fetchRankedQuests, fetchSavedQuests } = require('@/lib/api');
const { saveQuest } = require('@/lib/api');
const { unsaveQuest } = require('@/lib/api');
const ActiveChallengesScreen = require('@/app/(tabs)/active_challenges').default;

describe('ActiveChallengesScreen search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    const { getByTestId, queryByText } = render(<ActiveChallengesScreen />);

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
    const { getByTestId, queryByText } = render(<ActiveChallengesScreen />);

    await waitFor(() => expect(queryByText(/Cat quest/)).toBeTruthy());

    fireEvent.press(getByTestId('quest-card-save-button-quest-1'));

    await waitFor(() => expect(saveQuest).toHaveBeenCalledWith('quest-1'));

    fireEvent.press(getByTestId('quest-card-save-button-quest-1'));

    await waitFor(() => expect(unsaveQuest).toHaveBeenCalledWith('quest-1'));
  });
});
