export function normalizeAchievementCatalog(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((achievement) => {
      const id = typeof achievement?.id === 'string' ? achievement.id.trim() : '';
      const label = typeof achievement?.label === 'string' ? achievement.label.trim() : '';
      const description =
        typeof achievement?.description === 'string' ? achievement.description.trim() : '';
      const icon = typeof achievement?.icon === 'string' ? achievement.icon.trim() : '';
      const metric = typeof achievement?.metric === 'string' ? achievement.metric.trim() : '';
      const threshold = Number(achievement?.threshold);
      if (!id || !label || !icon || !metric || !Number.isFinite(threshold)) {
        return null;
      }
      return {
        id,
        label,
        ...(description ? { description } : {}),
        icon,
        metric,
        threshold,
      };
    })
    .filter(Boolean);
}

export function getAchievementDefinition(catalog, id) {
  if (!Array.isArray(catalog) || typeof id !== 'string' || !id) return null;
  return catalog.find((achievement) => achievement?.id === id) || null;
}

export function getEarnedAchievementIds(earnedAchievements) {
  if (!Array.isArray(earnedAchievements)) return [];
  return earnedAchievements
    .map((achievement) => (typeof achievement?.id === 'string' ? achievement.id : null))
    .filter(Boolean);
}
