import {
  challengeMatchesSearch,
  filterChallengesByPrompt,
  isQuestSearchReady,
  normalizeQuestSearchText,
} from '../questSearch';

describe('normalizeQuestSearchText', () => {
  it('normalizes casing, whitespace, and punctuation', () => {
    expect(normalizeQuestSearchText('  A-B non_location locked!! ')).toBe('abnonlocationlocked');
  });
});

describe('isQuestSearchReady', () => {
  it('starts live search at three normalized characters', () => {
    expect(isQuestSearchReady('AB')).toBe(false);
    expect(isQuestSearchReady('ABC')).toBe(true);
  });
});

describe('challengeMatchesSearch', () => {
  it('matches prompts case-insensitively', () => {
    expect(challengeMatchesSearch({ prompt: 'AB non-location locked' }, 'abn')).toBe(true);
  });

  it('ignores whitespace and punctuation while matching', () => {
    expect(challengeMatchesSearch({ prompt: 'AB non-location locked' }, 'a b non location')).toBe(true);
  });
});

describe('filterChallengesByPrompt', () => {
  it('preserves original order while filtering matching prompts', () => {
    const challenges = [
      { pinId: '1', prompt: 'First quest' },
      { pinId: '2', prompt: 'AB non-location locked' },
      { pinId: '3', prompt: 'Another AB prompt' },
    ];

    expect(filterChallengesByPrompt(challenges, 'ab')).toEqual([
      { pinId: '2', prompt: 'AB non-location locked' },
      { pinId: '3', prompt: 'Another AB prompt' },
    ]);
  });
});
