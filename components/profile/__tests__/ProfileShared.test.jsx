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
        earnedAchievements={[
          { id: 'photos_10', earned_at: '2026-04-18T00:00:00.000Z' },
        ]}
        colors={colors}
        styles={styles}
      />
    );

    expect(getByText('1/5')).toBeTruthy();
    expect(getByText('10 Photos')).toBeTruthy();
  });
});
