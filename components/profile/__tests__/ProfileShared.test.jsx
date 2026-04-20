import React from 'react';
import { render } from '@testing-library/react-native';

import { createProfileStyles, ProfileAchievementsCard, ProfileHeaderCard, ProfileTopPhotosCard } from '@/components/profile/ProfileShared';

const colors = {
  surface: '#FFFFFF',
  bg: '#F5F5F5',
  primary: '#111111',
  text: '#222222',
  textMuted: '#666666',
  border: '#DDDDDD',
  badgeEarnedBg: '#E5F4EA',
  badgeLockedBg: '#F1F1F1',
  badgeEarnedIcon: '#156F3D',
  badgeLockedIcon: '#999999',
};

const achievementCatalog = [
  { id: 'photos_1', label: 'First Photo', icon: 'camera-alt', metric: 'photo_count', threshold: 1 },
  { id: 'photos_10', label: '10 Photos', icon: 'photo-camera', metric: 'photo_count', threshold: 10 },
  { id: 'photos_100', label: '100 Photos', icon: 'collections', metric: 'photo_count', threshold: 100 },
  { id: 'elo_1100', label: '1100 Elo', icon: 'emoji-events', metric: 'max_global_elo', threshold: 1100 },
  { id: 'elo_1200', label: '1200 Elo', icon: 'emoji-events', metric: 'max_global_elo', threshold: 1200 },
  { id: 'elo_1500', label: '1500 Elo', icon: 'emoji-events', metric: 'max_global_elo', threshold: 1500 },
  { id: 'opinionated', label: 'Opinionated', icon: 'chat', metric: 'comment_count', threshold: 5 },
  { id: 'popular', label: 'Popular', icon: 'people', metric: 'friend_count', threshold: 10 },
];

describe('ProfileHeaderCard', () => {
  it('renders the handle and streak beneath the display name', () => {
    const styles = createProfileStyles(colors);
    const { getByText, getByLabelText } = render(
      <ProfileHeaderCard
        profile={{ display_name: 'Test User', handle: 'tester', bio: 'Bio' }}
        streak={7}
        styles={styles}
      />
    );

    expect(getByText('Test User')).toBeTruthy();
    expect(getByText('@tester')).toBeTruthy();
    expect(getByText('7')).toBeTruthy();
    expect(getByLabelText('7 day streak')).toBeTruthy();
  });
});

describe('ProfileTopPhotosCard', () => {
  it('renders top photo Elo in the bottom-right chip without the score banner label', () => {
    const styles = createProfileStyles(colors);
    const { getByText, queryByText } = render(
      <ProfileTopPhotosCard
        colors={colors}
        onPressPhoto={() => {}}
        styles={styles}
        topPhotos={[
          { _id: 'photo-1', file_url: 'https://example.com/photo-1.jpg', global_elo: 1137 },
        ]}
        topPhotosLoading={false}
      />
    );

    expect(getByText('1137')).toBeTruthy();
    expect(queryByText('Score 1137')).toBeNull();
  });
});

describe('ProfileAchievementsCard', () => {
  it('renders earned achievements from persisted achievement objects', () => {
    const styles = createProfileStyles(colors);
    const { getByText } = render(
      <ProfileAchievementsCard
        achievementCatalog={achievementCatalog}
        earnedAchievements={[
          { id: 'photos_10', earned_at: '2026-04-18T00:00:00.000Z' },
        ]}
        colors={colors}
        styles={styles}
      />
    );

    expect(getByText('1/8')).toBeTruthy();
    expect(getByText('10 Photos')).toBeTruthy();
    expect(getByText('1500 Elo')).toBeTruthy();
    expect(getByText('Opinionated')).toBeTruthy();
    expect(getByText('Popular')).toBeTruthy();
  });
});
