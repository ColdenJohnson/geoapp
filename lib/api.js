import { apiDelete, apiGet, apiPatch, apiPost } from './apiClient';
import { isInMainlandChina } from './geo';

export const TOKEN_SAFETY_BUFFER_MS = 15000;
const IS_DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

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
  if (!IS_DEV) return;
  const prefix = tokenPrefix(token);
  const ttl = timeToExpiryMs(expiresAt);
  console.log(`${message} (token ${prefix}${typeof token === 'string' ? '...' : ''}, ttl ${ttl ?? 'n/a'}ms)`);
}

function isInvalidVoteTokenError(error) {
  const status = error?.response?.status;
  const code = error?.response?.data?.error;
  return status === 401 || status === 403 || code === 'invalid_vote_token';
}


/* 
Create a new location pin, then add a photo to that pin.
*/
export async function
newChallenge(location, file_url, message) {
  try {
    const latitude = location?.coords?.latitude;
    const longitude = location?.coords?.longitude;
    const pinIsInMainland =
      typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      isInMainlandChina(latitude, longitude);

    const response = await apiPost('/new_challenge', {
      message: message,
      location: {
        latitude,
        longitude,
      },
      file_url: file_url,
      pinIsInMainland,
    });

    if (response.status !== 200) {
      console.error('Failed to send log to server');
      return;
    }

    console.log(`Location uploaded to server at ${location.coords.latitude}, ${location.coords.longitude}, with URL ${file_url}`);

    const pinId = response.data.pinId; // Assuming backend returns { pinId: ... }
    if (!pinId) {
      throw new Error('No pinId returned from server');
    }

    await addPhoto(pinId, file_url);
    console.log(`Photo challenge added for new pin ${pinId}`);
    return {
      pinId,
      pin: {
        _id: pinId,
        message,
        location: { latitude, longitude },
        pinIsInMainland,
        created_by_handle: response.data?.created_by_handle || null,
        photo_count: 1,
        most_recent_photo_url: file_url
      }
    };
  } catch (error) {
    console.error('Error sending addphotochallenge log to server:', error);
    return null;
  }
};

/* 
Add a photo to an existing pinId.
*/
export async function addPhoto(pinId, file_url) {
  try {
    console.log('calling addPhoto with pin id:', pinId);
    const response = await apiPost('/add_photo', {
      pinId: pinId,
      file_url: file_url
    });
    console.log(`Added new photo to pin ${pinId} with URL ${file_url}`);
    if (response.status !== 200) {
      console.error('Failed to send log to server');
    }
  } catch (error) {
    console.error('Error sending addphotochallenge log to server:', error);
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

// Fetch two photos for a duel within a pin
export async function fetchDuelByPinId(pinId) {
  try {
    const response = await apiGet(`/duel/${pinId}`);
    const photos = Array.isArray(response.data?.photos) ? response.data.photos : [];
    const voteToken = typeof response.data?.voteToken === 'string' ? response.data.voteToken : null;
    const expiresAt = typeof response.data?.expiresAt === 'string' ? response.data.expiresAt : null;
    devLogToken('Received pin duel payload', voteToken, expiresAt);
    return { photos, voteToken, expiresAt };
  } catch (error) {
    console.error('Failed to fetch duel for pin:', pinId, error);
    return { photos: [], voteToken: null, expiresAt: null };
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
    return { photos: [], voteToken: null, expiresAt: null, remainingVotes: null };
  }
}

// Submit a duel vote
export async function voteDuel({ pinId, winnerPhotoId, loserPhotoId, voteToken, expiresAt }) {
  if (!voteToken) {
    devLogToken('Missing pin duel vote token; skipping vote', voteToken);
    return { success: false, error: 'missing_vote_token', invalidVoteToken: true };
  }
  devLogToken('Submitting pin duel vote', voteToken, expiresAt);
  try {
    const response = await apiPost('/vote_duel', {
      pinId,
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
    console.error('Failed to submit duel vote:', error);
    return { success: false, error: error?.response?.data?.error, status: error?.response?.status };
  }
}

// Submit a global duel vote
export async function voteGlobalDuel({ winnerPhotoId, loserPhotoId, voteToken, expiresAt }) {
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

export async function refreshPinDuelToken(pinId, photoAId, photoBId, oldToken) {
  try {
    const response = await apiPost(`/duel/${pinId}/refresh_token`, {
      photoAId,
      photoBId,
      voteToken: oldToken,
    });
    const voteToken = typeof response.data?.voteToken === 'string' ? response.data.voteToken : null;
    const expiresAt = typeof response.data?.expiresAt === 'string' ? response.data.expiresAt : null;
    devLogToken('Refreshed pin duel token', voteToken, expiresAt);
    return { voteToken, expiresAt };
  } catch (error) {
    console.error('Failed to refresh pin duel token', error);
    throw error;
  }
}

export async function refreshGlobalDuelToken(photoAId, photoBId, oldToken) {
  try {
    const response = await apiPost('/global_duel/refresh_token', {
      photoAId,
      photoBId,
      voteToken: oldToken,
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
export async function fetchAllLocationPins() {
    try {
    const response = await apiGet('/view_all_location_pins');
    return response.data; // return list of all pins
    } catch (error) {
    console.error('Failed to fetch location pins:', error, 'This may have to do with .env.local file EXPO_PUBLIC_BASE_URL variable being stale');
    return [];
    }
};

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
