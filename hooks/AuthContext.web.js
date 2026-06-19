// Web-only mock AuthContext for the designer sandbox.
// Metro picks this file over AuthContext.js when bundling for web.
// Provides a fake logged-in user and pre-populated data so the app renders
// without Firebase, a backend, or any credentials.

import { createContext, useCallback, useState } from 'react';
import { ThemeContext } from '@/hooks/ThemeContext';
import {
  MOCK_USER,
  MOCK_PROFILE,
  MOCK_STATS,
  MOCK_FRIENDS,
  MOCK_FRIEND_REQUESTS,
  MOCK_TOP_PHOTOS,
  MOCK_FRIEND_ACTIVITY,
} from '@/lib/designerMockData';
import { DEFAULT_THEME_PREFERENCE } from '@/theme/themePreference';

export const AuthContext = createContext();

export const APP_TUTORIAL_STEPS = Object.freeze({
  QUESTS_TAB: 'quests_tab',
  FRIENDS_ADD: 'friends_add',
  PROFILE_EDIT: 'profile_edit',
});

const noop = () => {};
const noopAsync = async () => null;

export function AuthProvider({ children }) {
  const [friendActivityItems] = useState(MOCK_FRIEND_ACTIVITY.items);
  const [topPhotos] = useState(MOCK_TOP_PHOTOS);
  const [friends] = useState(MOCK_FRIENDS);
  const [stats] = useState(MOCK_STATS);

  const isAppTutorialStepVisible = useCallback(() => false, []);
  const advanceAppTutorial = useCallback(noopAsync, []);

  const value = {
    user: MOCK_USER,
    setUser: noop,
    profile: MOCK_PROFILE,
    loadingProfile: false,
    setProfile: noop,
    themePreference: DEFAULT_THEME_PREFERENCE,
    loadingAuth: false,
    friends,
    friendRequests: MOCK_FRIEND_REQUESTS,
    friendsLoading: false,
    stats,
    statsLoading: false,
    achievementCatalog: [],
    achievementCelebration: null,
    topPhotos,
    topPhotosLoading: false,
    friendActivityItems,
    friendActivitySuggestions: MOCK_FRIEND_ACTIVITY.suggestions,
    friendActivityInteractionSuggestions: MOCK_FRIEND_ACTIVITY.interactionSuggestions,
    friendActivityPendingChallenges: MOCK_FRIEND_ACTIVITY.pendingChallenges,
    friendActivityLoading: false,
    friendActivityLoadingMore: false,
    friendActivityFetchedAt: Date.now(),
    hasUnseenFriendActivity: true,
    removePendingChallenge: noop,
    isAppTutorialStepVisible,
    refreshFriends: noopAsync,
    refreshFriendRequests: noopAsync,
    refreshFriendActivity: noopAsync,
    loadMoreFriendActivity: noopAsync,
    dismissInteractionSuggestion: noopAsync,
    markFriendActivitySeen: noop,
    advanceAppTutorial,
    refreshStats: noopAsync,
    refreshTopPhotos: noopAsync,
    invalidateFriends: noop,
    invalidateStats: noop,
    invalidateTopPhotos: noop,
    applyStatsSnapshot: noopAsync,
    applyUploadResult: noopAsync,
    dismissAchievementCelebration: noop,
  };

  return (
    <AuthContext.Provider value={value}>
      <ThemeContext.Provider value={DEFAULT_THEME_PREFERENCE}>
        {children}
      </ThemeContext.Provider>
    </AuthContext.Provider>
  );
}
