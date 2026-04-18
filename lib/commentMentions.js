const HANDLE_BODY_REGEX = /^[a-zA-Z0-9_]{0,20}$/;
const HANDLE_CHAR_REGEX = /[a-zA-Z0-9_]/;

export function normalizeMentionHandle(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^@+/, '');
}

function getDisplayLabel(item) {
  return item?.display_name || item?.actor_display_name || item?.handle || item?.actor_handle || 'Unnamed user';
}

export function buildMentionCandidates(friends) {
  if (!Array.isArray(friends) || friends.length === 0) {
    return [];
  }

  const seenHandleNorms = new Set();

  return friends
    .map((friend) => {
      const handle = normalizeMentionHandle(friend?.handle || friend?.actor_handle || '');
      if (!handle) return null;
      const handleNorm = handle.toLowerCase();
      if (seenHandleNorms.has(handleNorm)) return null;
      seenHandleNorms.add(handleNorm);
      return {
        ...friend,
        mentionHandle: handle,
        mentionHandleNorm: handleNorm,
        mentionDisplayLabel: getDisplayLabel(friend),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const displayCompare = a.mentionDisplayLabel.localeCompare(b.mentionDisplayLabel);
      if (displayCompare !== 0) return displayCompare;
      return a.mentionHandle.localeCompare(b.mentionHandle);
    });
}

export function findActiveMention(text, selectionStart) {
  if (typeof text !== 'string') return null;

  const cursor = Math.max(0, Math.min(
    Number.isFinite(selectionStart) ? Math.floor(selectionStart) : text.length,
    text.length
  ));
  const beforeCursor = text.slice(0, cursor);
  const triggerIndex = beforeCursor.lastIndexOf('@');

  if (triggerIndex < 0) return null;

  const previousChar = triggerIndex > 0 ? beforeCursor.charAt(triggerIndex - 1) : '';
  if (previousChar && HANDLE_CHAR_REGEX.test(previousChar)) {
    return null;
  }

  const query = beforeCursor.slice(triggerIndex + 1);
  if (!HANDLE_BODY_REGEX.test(query)) {
    return null;
  }

  let end = cursor;
  while (end < text.length && HANDLE_CHAR_REGEX.test(text.charAt(end))) {
    end += 1;
  }

  return {
    start: triggerIndex,
    end,
    query,
    queryNorm: query.toLowerCase(),
  };
}

export function createMentionDismissKey(mention) {
  if (!mention) return null;
  return `${mention.start}:${mention.queryNorm}`;
}

export function filterMentionCandidates(candidates, query) {
  const normalizedQuery = normalizeMentionHandle(query).toLowerCase();
  const rows = Array.isArray(candidates) ? candidates : [];
  if (!normalizedQuery) {
    return rows;
  }
  return rows.filter((item) => item?.mentionHandleNorm?.startsWith(normalizedQuery));
}

export function replaceActiveMention(text, mention, handle) {
  const normalizedHandle = normalizeMentionHandle(handle);
  if (!mention || !normalizedHandle) {
    return {
      text: typeof text === 'string' ? text : '',
      selection: 0,
    };
  }

  const sourceText = typeof text === 'string' ? text : '';
  const prefix = sourceText.slice(0, mention.start);
  const suffix = sourceText.slice(mention.end);
  const shouldAppendSpace = suffix.length === 0 || !/^[\s.,!?;:)\]}]/.test(suffix);
  const insertedText = `@${normalizedHandle}${shouldAppendSpace ? ' ' : ''}`;
  const nextText = `${prefix}${insertedText}${suffix}`;

  return {
    text: nextText,
    selection: prefix.length + insertedText.length,
  };
}
