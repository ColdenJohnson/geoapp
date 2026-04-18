import achievementCatalog from '@/constants/achievements.json';

export const ACHIEVEMENT_CATALOG = achievementCatalog;

const ACHIEVEMENT_MAP = Object.fromEntries(
  ACHIEVEMENT_CATALOG.map((achievement) => [achievement.id, achievement])
);

export function getAchievementDefinition(id) {
  if (typeof id !== 'string' || !id) return null;
  return ACHIEVEMENT_MAP[id] || null;
}

export function getEarnedAchievementIds(earnedAchievements) {
  if (!Array.isArray(earnedAchievements)) return [];
  return earnedAchievements
    .map((achievement) => (typeof achievement?.id === 'string' ? achievement.id : null))
    .filter(Boolean);
}
