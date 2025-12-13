import { apiDelete, apiGet, apiPatch, apiPost } from './apiClient';
import { isInMainlandChina } from './geo';


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
  } catch (error) {
    console.error('Error sending addphotochallenge log to server:', error);
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
    return Array.isArray(response.data?.photos) ? response.data.photos : [];
  } catch (error) {
    console.error('Failed to fetch duel for pin:', pinId, error);
    return [];
  }
}

// Fetch two photos for a global duel across all photos
export async function fetchGlobalDuel() {
  try {
    const response = await apiGet('/global_duel');
    return Array.isArray(response.data?.photos) ? response.data.photos : [];
  } catch (error) {
    console.error('Failed to fetch global duel:', error);
    return [];
  }
}

// Submit a duel vote
export async function voteDuel({ pinId, winnerPhotoId, loserPhotoId }) {
  try {
    const response = await apiPost('/vote_duel', {
      pinId, winnerPhotoId, loserPhotoId
    });
    return response.data;
  } catch (error) {
    console.error('Failed to submit duel vote:', error);
    return { success: false };
  }
}

// Submit a global duel vote
export async function voteGlobalDuel({ winnerPhotoId, loserPhotoId }) {
  try {
    const response = await apiPost('/vote_duel_global', {
      winnerPhotoId,
      loserPhotoId
    });
    return response.data;
  } catch (error) {
    console.error('Failed to submit global duel vote:', error);
    return { success: false };
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
