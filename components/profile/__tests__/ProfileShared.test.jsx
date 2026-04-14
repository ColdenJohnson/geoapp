import React from 'react';
import { render } from '@testing-library/react-native';

import { createProfileStyles, ProfileHeaderCard } from '@/components/profile/ProfileShared';

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
    expect(getByText('🔥')).toBeTruthy();
    expect(getByText('7')).toBeTruthy();
    expect(getByLabelText('7 day streak')).toBeTruthy();
  });
});
