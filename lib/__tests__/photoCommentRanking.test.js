const { getTopRankedPhotoComment, isPhotoCommentHigherRank } = require('../photoCommentRanking');

describe('photoCommentRanking', () => {
  it('prefers the most liked comment', () => {
    const topComment = getTopRankedPhotoComment([
      { _id: 'comment-1', text: 'older', like_count: 2, createdAt: '2026-03-20T10:00:00.000Z' },
      { _id: 'comment-2', text: 'winner', like_count: 5, createdAt: '2026-03-19T10:00:00.000Z' },
      { _id: 'comment-3', text: 'newer', like_count: 3, createdAt: '2026-03-21T10:00:00.000Z' },
    ]);

    expect(topComment?._id).toBe('comment-2');
  });

  it('prefers the newest comment when likes are tied', () => {
    const topComment = getTopRankedPhotoComment([
      { _id: 'comment-1', text: 'old', like_count: 4, createdAt: '2026-03-20T10:00:00.000Z' },
      { _id: 'comment-2', text: 'new', like_count: 4, createdAt: '2026-03-21T10:00:00.000Z' },
    ]);

    expect(topComment?._id).toBe('comment-2');
  });

  it('ignores comments without displayable text', () => {
    const topComment = getTopRankedPhotoComment([
      { _id: 'comment-1', text: '   ', like_count: 99, createdAt: '2026-03-21T10:00:00.000Z' },
      { _id: 'comment-2', text: 'usable', like_count: 1, createdAt: '2026-03-19T10:00:00.000Z' },
    ]);

    expect(topComment?._id).toBe('comment-2');
  });

  it('falls back to id ordering when likes and timestamps are identical', () => {
    expect(isPhotoCommentHigherRank(
      { _id: 'comment-9', text: 'higher', like_count: 2, createdAt: '2026-03-21T10:00:00.000Z' },
      { _id: 'comment-2', text: 'lower', like_count: 2, createdAt: '2026-03-21T10:00:00.000Z' }
    )).toBe(true);
  });
});
