export const HANDLE_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
export const HANDLE_VALIDATION_MESSAGE = 'Handle must be 3-20 letters, numbers, or underscores.';

export function normalizeHandleInput(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.replace(/^@/, '');
}

export function getHandleValidationMessage(value) {
  const normalized = normalizeHandleInput(value);
  if (!normalized) {
    return null;
  }

  return HANDLE_REGEX.test(normalized) ? null : HANDLE_VALIDATION_MESSAGE;
}

export function findExactHandleMatch(rows, handle) {
  const normalized = normalizeHandleInput(handle).toLowerCase();
  if (!normalized || !Array.isArray(rows)) {
    return null;
  }

  return rows.find((row) => normalizeHandleInput(row?.handle).toLowerCase() === normalized) || null;
}
