import {
  challengeMatchesSearch,
  filterChallengesByPrompt,
  isQuestSearchReady,
  normalizeQuestSearchText,
} from '../questSearch';

describe('normalizeQuestSearchText', () => {
  it('normalizes casing, whitespace, and punctuation', () => {
    expect(normalizeQuestSearchText('  A-B public_quest!! ')).toBe('abpublicquest');
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
    expect(challengeMatchesSearch({ prompt: 'AB public quest' }, 'abp')).toBe(true);
  });

  it('ignores whitespace and punctuation while matching', () => {
    expect(challengeMatchesSearch({ prompt: 'AB public quest' }, 'a b public')).toBe(true);
  });
});

describe('filterChallengesByPrompt', () => {
  it('preserves original order while filtering matching prompts', () => {
    const challenges = [
      { pinId: '1', prompt: 'First quest' },
      { pinId: '2', prompt: 'AB public quest' },
      { pinId: '3', prompt: 'Another AB prompt' },
    ];

    expect(filterChallengesByPrompt(challenges, 'ab')).toEqual([
      { pinId: '2', prompt: 'AB public quest' },
      { pinId: '3', prompt: 'Another AB prompt' },
    ]);
  });
});
