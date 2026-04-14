import { apiDelete, apiGet, apiPatch, apiPost } from './apiClient';
import { CHALLENGE_UPLOAD_DISTANCE_METERS } from './challengeGeoAccess';
import { isInMainlandChina } from './geo';

export const TOKEN_SAFETY_BUFFER_MS = 15000;
const IS_DEV_LOG = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

function tokenPrefix(token) {
  return typeof token === 'string' ? token.slice(0, 8) : 'none';
}

function timeToExpiryMs(expiresAt) {
  if (!expiresAt) return null;
  const ms = Date.parse(expiresAt) - Date.now();
  return Number.isFinite(ms) ? ms : null;
}

export function isTokenFresh(expiresAt) {
  const ttl = timeToExpiryMs(expiresAt);
  return Number.isFinite(ttl) && ttl > TOKEN_SAFETY_BUFFER_MS;
}

function devLogToken(message, token, expiresAt) {
  if (!IS_DEV_LOG) return;
  const prefix = tokenPrefix(token);
  const ttl = timeToExpiryMs(expiresAt);
  console.log(`${message} (token ${prefix}${typeof token === 'string' ? '...' : ''}, ttl ${ttl ?? 'n/a'}ms)`);
}

function isInvalidVoteTokenError(error) {
  const status = error?.response?.status;
  const code = error?.response?.data?.error;
  return status === 401 || status === 403 || code === 'invalid_vote_token';
}

function normalizeCoordinate(value) {
  const latitude = Number(value?.latitude ?? value?.coords?.latitude);
  const longitude = Number(value?.longitude ?? value?.coords?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return { latitude, longitude };
}


/* 
Create a new location pin with its initial photo.
*/
export async function
newChallenge(location, file_url, message, options = {}) {
  try {
    const normalizedLocation = normalizeCoordinate(location);
    const latitude = normalizedLocation?.latitude;
    const longitude = normalizedLocation?.longitude;
    const isGeoLocked = typeof options?.isGeoLocked === 'boolean' ? options.isGeoLocked : true;
    const clientUploadId = typeof options?.clientUploadId === 'string' ? options.clientUploadId.trim() : '';
    const photoLocation = normalizeCoordinate(options?.photoLocation)
      || normalizedLocation;
    const pinIsInMainland =
      typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      isInMainlandChina(latitude, longitude);

    const payload = {
      message: message,
      location: {
        latitude,
        longitude,
      },
      file_url: file_url,
      pinIsInMainland,
      isGeoLocked,
    };
    if (clientUploadId) {
      payload.client_upload_id = clientUploadId;
    }
    if (photoLocation) {
      payload.photo_location = photoLocation;
    }

    const response = await apiPost('/new_challenge', payload);

    if (response.status !== 200) {
      console.error('Failed to send log to server');
      return;
    }

    if (typeof latitude === 'number' && typeof longitude === 'number') {
      console.log(`Location uploaded to server at ${latitude}, ${longitude}, with URL ${file_url}`);
    } else {
      console.log(`Non-geo challenge uploaded with URL ${file_url}`);
    }

    const pinId = response.data.pinId; // Assuming backend returns { pinId: ... }
    if (!pinId) {
      throw new Error('No pinId returned from server');
    }

    console.log(`Challenge created with initial photo for pin ${pinId}`);
    const nowIso = new Date().toISOString();
    const responsePin = response.data?.pin && typeof response.data.pin === 'object'
      ? response.data.pin
      : null;
    const responsePhoto = response.data?.photo && typeof response.data.photo === 'object'
      ? response.data.photo
      : null;
    const fallbackPhoto = {
      _id: responsePhoto?._id || null,
      file_url,
      global_elo: Number.isFinite(responsePhoto?.global_elo) ? responsePhoto.global_elo : 1000,
      global_wins: Number.isFinite(responsePhoto?.global_wins) ? responsePhoto.global_wins : 0,
      global_losses: Number.isFinite(responsePhoto?.global_losses) ? responsePhoto.global_losses : 0,
      created_by: responsePhoto?.created_by || null,
      created_by_handle: responsePhoto?.created_by_handle || response.data?.created_by_handle || null,
      createdAt: responsePhoto?.createdAt || nowIso,
    };
    return {
      pinId,
      pin: responsePin || {
        _id: pinId,
        message,
        location: { latitude, longitude },
        pinIsInMainland,
        isGeoLocked,
        upload_distance_meters:
          Number(response.data?.upload_distance_meters) || CHALLENGE_UPLOAD_DISTANCE_METERS,
        isPrivate: response.data?.isPrivate === true,
        viewer_has_uploaded: true,
        created_by_handle: response.data?.created_by_handle || null,
        created_by_name: response.data?.created_by_name || null,
        photo_count: 1,
        most_recent_photo_url: file_url,
        createdAt: nowIso,
        updatedAt: nowIso,
        top_global_photo: {
          photo_id: null,
          file_url,
          global_elo: 1000,
          ...(photoLocation ? { location: photoLocation } : {}),
          createdAt: nowIso,
          dirty: false,
          updatedAt: nowIso,
        },
      },
      photo: responsePhoto || fallbackPhoto,
    };
  } catch (error) {
    console.error('Error sending addphotochallenge log to server:', error);
    return null;
  }
};

/* 
Add a photo to an existing pinId.
*/
export async function addPhoto(pinId, file_url, options = {}) {
  try {
    console.log('calling addPhoto with pin id:', pinId);
    const payload = {
      pinId: pinId,
      file_url: file_url
    };
    const clientUploadId = typeof options?.clientUploadId === 'string' ? options.clientUploadId.trim() : '';
    const photoLocation = normalizeCoordinate(options?.photoLocation);
    if (clientUploadId) {
      payload.client_upload_id = clientUploadId;
    }
    if (photoLocation) {
      payload.photo_location = photoLocation;
    }
    const response = await apiPost('/add_photo', payload);
    console.log(`Added new photo to pin ${pinId} with URL ${file_url}`);
    if (response.status !== 200) {
      throw new Error('Failed to add photo');
    }
    return response.data || { success: true };
  } catch (error) {
    console.error('Error sending addphotochallenge log to server:', error);
    throw error;
  }
};

/* 
Fetch all photos for a specific pinId. Returns an array of photo objects.
*/
export async function fetchPhotosByPinId(pinId) {
    try {
      const response = await apiGet(`/view_photos_by_pin/${pinId}`);
      console.log('Fetched photos for pin:', pinId, response.data);
      return response.data; // array of photo objects
    } catch (error) {
      console.error('Failed to fetch photos for pin:', error);
      return [];
    }
  }

  export async function fetchChallengeByPinId(pinId) {
    try {
      const response = await apiGet(`/view_challenge_by_pin/${pinId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch challenge for pin:', error);
      return null;
    }
  }

export async function fetchPhotoComments(photoId) {
  try {
    const response = await apiGet(`/photos/${photoId}/comments`);
    return Array.isArray(response.data?.items) ? response.data.items : [];
  } catch (error) {
    console.error('Failed to fetch comments for photo:', photoId, error);
    return [];
  }
}

export async function deletePhoto(photoId) {
  try {
    const response = await apiDelete(`/photos/${photoId}`);
    return response.data || { success: true };
  } catch (error) {
    console.error('Failed to delete photo:', photoId, error);
    return {
      success: false,
      error: error?.response?.data?.error || 'Failed to delete photo',
    };
  }
}

export async function createPhotoComment(photoId, text) {
  try {
    const response = await apiPost(`/photos/${photoId}/comments`, { text });
    return response.data?.comment || null;
  } catch (error) {
    console.error('Failed to create comment for photo:', photoId, error);
    return null;
  }
}

export async function likePhotoComment(commentId) {
  try {
    const response = await apiPost(`/photo_comments/${commentId}/like`, {});
    return response.data?.comment || null;
  } catch (error) {
    console.error('Failed to like comment:', commentId, error);
    return null;
  }
}

export async function unlikePhotoComment(commentId) {
  try {
    const response = await apiDelete(`/photo_comments/${commentId}/like`);
    return response.data?.comment || null;
  } catch (error) {
    console.error('Failed to unlike comment:', commentId, error);
    return null;
  }
}

// Fetch two photos for a global duel across all photos
export async function fetchGlobalDuel() {
  try {
    const response = await apiGet('/global_duel');
    const photos = Array.isArray(response.data?.photos) ? response.data.photos : [];
    const voteToken = typeof response.data?.voteToken === 'string' ? response.data.voteToken : null;
    const expiresAt = typeof response.data?.expiresAt === 'string' ? response.data.expiresAt : null;
    const remainingVotes = Number.isFinite(response.data?.remainingVotes) ? response.data.remainingVotes : null;
    devLogToken('Received global duel payload', voteToken, expiresAt);
    return { photos, voteToken, expiresAt, remainingVotes };
  } catch (error) {
    console.error('Failed to fetch global duel:', error);
    return {
      photos: [],
      voteToken: null,
      expiresAt: null,
      remainingVotes: null,
    };
  }
}

// Submit a global duel vote
export async function voteGlobalDuel({
  winnerPhotoId,
  loserPhotoId,
  voteToken,
  expiresAt,
}) {
  if (!voteToken) {
    devLogToken('Missing global duel vote token; skipping vote', voteToken);
    return { success: false, error: 'missing_vote_token', invalidVoteToken: true };
  }
  devLogToken('Submitting global duel vote', voteToken, expiresAt);
  try {
    const response = await apiPost('/vote_duel_global', {
      winnerPhotoId,
      loserPhotoId,
      voteToken,
    });
    return response.data;
  } catch (error) {
    if (isInvalidVoteTokenError(error)) {
      return {
        success: false,
        error: error?.response?.data?.error || 'invalid_vote_token',
        invalidVoteToken: true,
        status: error?.response?.status,
      };
    }
    console.error('Failed to submit global duel vote:', error);
    return { success: false, error: error?.response?.data?.error, status: error?.response?.status };
  }
}

export async function refreshGlobalDuelToken(photoAId, photoBId, oldToken) {
  try {
    const response = await apiPost('/global_duel/refresh_token', {
      photoAId,
      photoBId,
      oldToken,
    });
    const voteToken = typeof response.data?.voteToken === 'string' ? response.data.voteToken : null;
    const expiresAt = typeof response.data?.expiresAt === 'string' ? response.data.expiresAt : null;
    devLogToken('Refreshed global duel token', voteToken, expiresAt);
    return { voteToken, expiresAt };
  } catch (error) {
    console.error('Failed to refresh global duel token', error);
    throw error;
  }
}


/* 
Fetch all location pins. Returns an array of location pin objects.
*/
function buildGeoLockedFilterQuery(options = {}) {
  const hasGeoLockedFilter = typeof options?.isGeoLocked === 'boolean';
  return hasGeoLockedFilter ? `?isGeoLocked=${options.isGeoLocked}` : '';
}

function buildRankedQuestQuery(options = {}) {
  const params = new URLSearchParams();
  if (options?.includeRankingDebug === true) {
    params.set('includeRankingDebug', 'true');
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function fetchAllLocationPins(options = {}) {
    try {
    const query = buildGeoLockedFilterQuery(options);
    const response = await apiGet(`/view_all_location_pins${query}`);
    return response.data; // return list of all pins
    } catch (error) {
    console.error('Failed to fetch location pins:', error, 'This may have to do with .env.local file EXPO_PUBLIC_BASE_URL variable being stale');
    return [];
    }
};

/*
Fetch private location pins created by the user or accepted friends.
*/
export async function fetchFriendPrivateLocationPins(options = {}) {
  try {
    const query = buildGeoLockedFilterQuery(options);
    const response = await apiGet(`/view_friend_private_location_pins${query}`);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch private friend pins:', error);
    return [];
  }
}

/*
Fetch quests ranked for the active challenges tab.
*/
export async function fetchRankedQuests(options = {}) {
  try {
    const query = buildRankedQuestQuery(options);
    const response = await apiGet(`/ranked_quests${query}`);
    return Array.isArray(response.data?.items) ? response.data.items : [];
  } catch (error) {
    console.error('Failed to fetch ranked quests:', error);
    return [];
  }
}

/*
Set pin privacy (owner-only).
*/
export async function setPinPrivacy(pinId, isPrivate) {
  try {
    const response = await apiPatch(`/pin/${pinId}/privacy`, { isPrivate: !!isPrivate });
    return response.data?.pin || null;
  } catch (error) {
    console.error('Failed to update pin privacy:', error);
    return null;
  }
}

/*
Save a quest for later from the active challenges screen.
*/
export async function saveQuest(pinId) {
  try {
    const response = await apiPost('/saved_quests', { pinId });
    return response.data || { success: true, saved: true, alreadySaved: false };
  } catch (error) {
    console.error('Failed to save quest:', error);
    return {
      success: false,
      error: error?.response?.data?.error || 'Failed to save quest',
    };
  }
}

/*
Remove a saved quest.
*/
export async function unsaveQuest(pinId) {
  try {
    const response = await apiDelete(`/saved_quests/${encodeURIComponent(pinId)}`);
    return response.data || { success: true, removed: true };
  } catch (error) {
    console.error('Failed to unsave quest:', error);
    return {
      success: false,
      error: error?.response?.data?.error || 'Failed to unsave quest',
    };
  }
}

/*
Fetch saved quests for the current user.
*/
export async function fetchSavedQuests(options = {}) {
  try {
    const parsedLimit = Number.parseInt(String(options?.limit || 120), 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 300) : 120;
    const response = await apiGet(`/saved_quests?limit=${limit}`);
    const items = Array.isArray(response.data?.items) ? response.data.items : [];
    return items;
  } catch (error) {
    console.error('Failed to fetch saved quests:', error);
    return [];
  }
}

/* Fetch user profile by UID */
export async function fetchUsersByUID(uid) {
  try {
    const response = await apiGet(`/users_by_uid/${uid}`);
    console.log('Fetched user profile for uid:', uid, response.data);
    return response.data; // user profile object
  } catch (error) {
    console.error('Failed to fetch user profile for uid:', uid, error);
    return null;
  }
}

/* Fetch user stats by UID */
export async function fetchUserStats(uid) {
  try {
    const response = await apiGet(`/user_stats/${uid}`);
    console.log('Fetched user stats for uid:', uid, response.data);
    return response.data; // stats object
  } catch (error) {
    console.error('Failed to fetch user stats for uid:', uid, error);
    return null;
  }
}

/* Fetch top user photos by Elo rank */
export async function fetchUserTopPhotos(uid, { limit = 2 } = {}) {
  try {
    const parsedLimit = Number.parseInt(String(limit), 10);
    const normalizedLimit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 10)
      : 2;
    const response = await apiGet(
      `/user_top_photos/${uid}?limit=${normalizedLimit}`
    );
    const rows = Array.isArray(response.data) ? response.data : [];
    console.log('Fetched top photos for uid:', uid, rows.length);
    return rows;
  } catch (error) {
    console.error('Failed to fetch top photos for uid:', uid, error);
    return [];
  }
}

/* Update the user profile by UID.
Takes a uid and a partial update object (e.g., { display_name: "New Name", bio: "New bio" }).
Returns the updated user profile.
*/
export async function updateUserProfile(uid, updates) {
  try {
    const response = await apiPatch(
      `/update_user_profile/${uid}`,
      updates
    );
    console.log('Updated user profile for uid:', uid, response.data);
    return response.data; // updated user profile object
  } catch (error) {
    console.error('Failed to update user profile for uid:', uid, error);
    return null;
  }
}

// Set or change the authenticated user's handle
export async function setUserHandle(handle) {
  try {
    const response = await apiPost('/user/handle', { handle });
    console.log('Set user handle:', response.data?.handle || handle);
    return response.data;
  } catch (error) {
    console.error('Failed to set user handle:', error);
    return { success: false, error: error?.response?.data?.error || 'Failed to set handle' };
  }
}

// Search a user by handle
export async function searchUserByHandle(handle) {
  try {
    const response = await apiGet(`/users/search?handle=${encodeURIComponent(handle)}`);
    const count = Array.isArray(response.data) ? response.data.length : 0;
    console.log('Searched user by handle:', handle, count);
    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    console.error('Failed to search user by handle:', error);
    return [];
  }
}

export async function fetchContactMatches({ phoneNumbers, defaultCountry } = {}) {
  try {
    const normalizedPhoneNumbers = Array.isArray(phoneNumbers) ? phoneNumbers.filter(Boolean) : [];
    if (!normalizedPhoneNumbers.length) {
      return [];
    }
    const response = await apiPost('/friends/contact-matches', {
      phone_numbers: normalizedPhoneNumbers,
      default_country: defaultCountry || null,
    });
    const count = Array.isArray(response.data) ? response.data.length : 0;
    console.log('Fetched contact matches:', count);
    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    console.error('Failed to fetch contact matches:', error);
    return [];
  }
}

// Send a friend request by handle or uid
export async function requestFriend({ handle, target_uid }) {
  try {
    const response = await apiPost('/friends/request', { handle, target_uid });
    console.log('Sent friend request:', handle || target_uid, response.data?.status || 'unknown');
    return response.data;
  } catch (error) {
    console.error('Failed to send friend request:', error);
    return { success: false, error: error?.response?.data?.error || 'Failed to send friend request' };
  }
}

// Accept a friend request
export async function acceptFriendRequest(uid) {
  try {
    const response = await apiPost('/friends/accept', { uid });
    console.log('Accepted friend request from uid:', uid, response.data?.status || 'unknown');
    return response.data;
  } catch (error) {
    console.error('Failed to accept friend request:', error);
    return { success: false, error: error?.response?.data?.error || 'Failed to accept friend request' };
  }
}

export async function rejectFriendRequest(uid) {
  try {
    const response = await apiPost('/friends/reject', { uid });
    console.log('Rejected friend request from uid:', uid, response.data?.status || 'unknown');
    return response.data;
  } catch (error) {
    console.error('Failed to reject friend request:', error);
    return { success: false, error: error?.response?.data?.error || 'Failed to reject friend request' };
  }
}

export async function cancelFriendRequest(uid) {
  try {
    const response = await apiPost('/friends/cancel', { uid });
    console.log('Canceled friend request to uid:', uid, response.data?.status || 'unknown');
    return response.data;
  } catch (error) {
    console.error('Failed to cancel friend request:', error);
    return { success: false, error: error?.response?.data?.error || 'Failed to cancel friend request' };
  }
}

export async function removeFriend(uid) {
  try {
    const response = await apiPost('/friends/remove', { uid });
    console.log('Removed friend uid:', uid, response.data?.status || 'unknown');
    return response.data;
  } catch (error) {
    console.error('Failed to remove friend:', error);
    return {
      success: false,
      statusCode: error?.response?.status || null,
      error: error?.response?.data?.error || 'Failed to remove friend'
    };
  }
}

// Fetch accepted friends
export async function fetchFriends() {
  try {
    const response = await apiGet('/friends');
    console.log('Fetched friends:', Array.isArray(response.data) ? response.data.length : 0);
    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    console.error('Failed to fetch friends:', error);
    return [];
  }
}

// Fetch pending friend requests
export async function fetchFriendRequests() {
  try {
    const response = await apiGet('/friends/requests');
    const incoming = Array.isArray(response.data?.incoming) ? response.data.incoming : [];
    const outgoing = Array.isArray(response.data?.outgoing) ? response.data.outgoing : [];
    console.log('Fetched friend requests:', { incoming: incoming.length, outgoing: outgoing.length });
    return { incoming, outgoing };
  } catch (error) {
    console.error('Failed to fetch friend requests:', error);
    return { incoming: [], outgoing: [] };
  }
}

export async function fetchFriendActivity(options = {}) {
  try {
    const query = new URLSearchParams();
    const limit = Number.parseInt(options?.limit, 10);
    if (Number.isFinite(limit) && limit > 0) {
      query.set('limit', String(limit));
    }
    const cursorCreatedAt = typeof options?.cursor?.cursor_created_at === 'string'
      ? options.cursor.cursor_created_at
      : '';
    const cursorId = typeof options?.cursor?.cursor_id === 'string'
      ? options.cursor.cursor_id
      : '';
    if (cursorCreatedAt && cursorId) {
      query.set('cursor_created_at', cursorCreatedAt);
      query.set('cursor_id', cursorId);
    }

    const response = await apiGet(`/friends/activity${query.toString() ? `?${query.toString()}` : ''}`);
    const items = Array.isArray(response.data?.items) ? response.data.items : [];
    const suggestions = Array.isArray(response.data?.suggestions) ? response.data.suggestions : [];
    const nextCursor = response.data?.next_cursor && typeof response.data.next_cursor === 'object'
      ? response.data.next_cursor
      : null;
    console.log('Fetched friend activity:', { items: items.length, suggestions: suggestions.length, hasNext: !!nextCursor });
    return { items, suggestions, nextCursor };
  } catch (error) {
    console.error('Failed to fetch friend activity:', error);
    return { items: [], suggestions: [], nextCursor: null };
  }
}

// Register / refresh an Expo push token for the current user so the backend can trigger notifications.
export async function registerPushToken({ token, platform, timezoneOffsetMinutes, uid }) {
  try {
    await apiPost('/register_push_token', {
      token,
      platform,
      timezoneOffsetMinutes,
      uid,
    });
  } catch (error) {
    console.error('Failed to register push token:', error);
  }
}

// Log client-side notification lifecycle events (received/opened)
export async function logNotificationEvent({
  notificationId,
  event,
  uid,
  timestamp = new Date().toISOString(),
  route,
  payload,
}) {
  try {
    await apiPost('/notification_event', {
      notificationId: notificationId || null,
      event,
      uid,
      timestamp,
      route: route || null,
      payload: payload || null,
    });
  } catch (error) {
    console.error('Failed to log notification event:', error);
  }
}

// Delete the currently authenticated user's account
export async function deleteMyAccount() {
  try {
    const response = await apiDelete('/delete_account');
    return response?.data || { success: true };
  } catch (error) {
    console.error('Failed to delete account:', error);
    return { success: false, error: error?.message || String(error) };
  }
}
