/* eslint-env jest */

import {
  buildMentionCandidates,
  createMentionDismissKey,
  filterMentionCandidates,
  findActiveMention,
  replaceActiveMention,
} from '@/lib/commentMentions';

describe('comment mention helpers', () => {
  it('builds unique mention candidates from friends with handles', () => {
    const rows = buildMentionCandidates([
      { uid: '2', display_name: 'Zed', handle: 'zed' },
      { uid: '1', display_name: 'Alpha', handle: '@alpha' },
      { uid: '3', display_name: 'Ignore Me' },
      { uid: '4', display_name: 'Duplicate', handle: 'ALPHA' },
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        uid: '1',
        mentionHandle: 'alpha',
        mentionHandleNorm: 'alpha',
        mentionDisplayLabel: 'Alpha',
      }),
      expect.objectContaining({
        uid: '2',
        mentionHandle: 'zed',
        mentionHandleNorm: 'zed',
        mentionDisplayLabel: 'Zed',
      }),
    ]);
  });

  it('finds the active mention nearest the cursor and ignores invalid tokens', () => {
    expect(findActiveMention('hey @kr', 7)).toEqual({
      start: 4,
      end: 7,
      query: 'kr',
      queryNorm: 'kr',
    });
    expect(findActiveMention('email@test', 10)).toBeNull();
    expect(findActiveMention('@kr hi', 6)).toBeNull();
  });

  it('filters mention candidates by handle prefix only', () => {
    const candidates = buildMentionCandidates([
      { uid: '1', display_name: 'Krishna', handle: 'krishna' },
      { uid: '2', display_name: 'Chris', handle: 'chris' },
      { uid: '3', display_name: 'Kris', handle: 'kris' },
    ]);

    expect(filterMentionCandidates(candidates, 'kr')).toEqual([
      expect.objectContaining({ uid: '3' }),
      expect.objectContaining({ uid: '1' }),
    ]);
    expect(filterMentionCandidates(candidates, 'ris')).toEqual([]);
  });

  it('replaces the active token with a visible handle mention', () => {
    const mention = findActiveMention('hello @kr there', 9);
    const replacement = replaceActiveMention('hello @kr there', mention, 'krishna');

    expect(replacement).toEqual({
      text: 'hello @krishna there',
      selection: 14,
    });
  });

  it('creates a dismiss key that changes as the mention query changes', () => {
    const firstMention = findActiveMention('@kr', 3);
    const secondMention = findActiveMention('@kri', 4);

    expect(createMentionDismissKey(firstMention)).toBe('0:kr');
    expect(createMentionDismissKey(secondMention)).toBe('0:kri');
  });
});
