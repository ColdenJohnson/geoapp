export function normalizeQuestSearchText(value) {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function isQuestSearchReady(value, minimumCharacters = 3) {
  return normalizeQuestSearchText(value).length >= minimumCharacters;
}

export function challengeMatchesSearch(challenge, query) {
  const normalizedQuery = normalizeQuestSearchText(query);
  if (!normalizedQuery) return true;

  const normalizedPrompt = normalizeQuestSearchText(challenge?.prompt);
  return normalizedPrompt.includes(normalizedQuery);
}

export function filterChallengesByPrompt(challenges, query) {
  if (!Array.isArray(challenges)) return [];

  const normalizedQuery = normalizeQuestSearchText(query);
  if (!normalizedQuery) return challenges;

  return challenges.filter((challenge) => challengeMatchesSearch(challenge, normalizedQuery));
}
