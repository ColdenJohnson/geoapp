function getCommentLikeCount(comment) {
  return Number.isFinite(comment?.like_count) ? comment.like_count : 0;
}

function getCommentCreatedAtMs(comment) {
  if (!comment?.createdAt) return 0;
  const ms = Date.parse(comment.createdAt);
  return Number.isFinite(ms) ? ms : 0;
}

function getCommentIdValue(comment) {
  if (!comment?._id) return '';
  return String(comment._id);
}

function hasDisplayableCommentText(comment) {
  return typeof comment?.text === 'string' && comment.text.trim().length > 0;
}

export function isPhotoCommentHigherRank(candidate, current) {
  if (!hasDisplayableCommentText(candidate)) return false;
  if (!hasDisplayableCommentText(current)) return true;

  const candidateLikes = getCommentLikeCount(candidate);
  const currentLikes = getCommentLikeCount(current);
  if (candidateLikes !== currentLikes) {
    return candidateLikes > currentLikes;
  }

  const candidateCreatedAtMs = getCommentCreatedAtMs(candidate);
  const currentCreatedAtMs = getCommentCreatedAtMs(current);
  if (candidateCreatedAtMs !== currentCreatedAtMs) {
    return candidateCreatedAtMs > currentCreatedAtMs;
  }

  return getCommentIdValue(candidate) > getCommentIdValue(current);
}

export function getTopRankedPhotoComment(comments) {
  if (!Array.isArray(comments) || comments.length === 0) {
    return null;
  }

  return comments.reduce((best, comment) => (
    isPhotoCommentHigherRank(comment, best) ? comment : best
  ), null);
}
