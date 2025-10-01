import axios from 'axios';
import { getAuth } from 'firebase/auth';
import Constants from 'expo-constants';

// Resolve base URL with env first, then app.json extra, then a safe default
const PUBLIC_BASE_URL =
  process.env.EXPO_PUBLIC_BASE_URL ||
  (Constants?.expoConfig?.extra && (Constants.expoConfig.extra.EXPO_PUBLIC_BASE_URL || Constants.expoConfig.extra.apiBaseUrl)) ||
  'https://geode-backend-834952308922.us-central1.run.app';

export function getBaseUrl() { return PUBLIC_BASE_URL; }

export async function pingBackend() {
  try {
    const r = await axios.get(`${PUBLIC_BASE_URL}/healthz`, { timeout: 5000 });
    return { ok: true, status: r.status, data: r.data, baseUrl: PUBLIC_BASE_URL };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), baseUrl: PUBLIC_BASE_URL };
  }
}

// TODO: check this function a bit
async function getAuthHeader() {
  const user = getAuth().currentUser;
  if (user) {
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}


/* 
Create a new location pin, then add a photo to that pin.
*/
export async function
newChallenge(location, file_url, message) {
  try {
    const headers = await getAuthHeader();
    const response = await axios.post(`${PUBLIC_BASE_URL}/new_challenge`, {
      message: message,
      location: {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      },
      file_url: file_url
    }, { headers });

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
    const headers = await getAuthHeader();
    const response = await axios.post(`${PUBLIC_BASE_URL}/add_photo`, {
      pinId: pinId,
      file_url: file_url
    }, { headers });
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
      const headers = await getAuthHeader();
      const response = await axios.get(`${PUBLIC_BASE_URL}/view_photos_by_pin/${pinId}`, { headers });
      console.log('Fetched photos for pin:', pinId, response.data);
      return response.data; // array of photo objects
    } catch (error) {
      console.error('Failed to fetch photos for pin:', error);
      return [];
    }
  }

  export async function fetchChallengeByPinId(pinId) {
    try {
      const headers = await getAuthHeader();
      const response = await axios.get(`${PUBLIC_BASE_URL}/view_challenge_by_pin/${pinId}`, { headers });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch challenge for pin:', error);
      return null;
    }
  }

// Fetch two photos for a duel within a pin
export async function fetchDuelByPinId(pinId) {
  try {
    const headers = await getAuthHeader();
    const response = await axios.get(`${PUBLIC_BASE_URL}/duel/${pinId}`, { headers });
    return Array.isArray(response.data?.photos) ? response.data.photos : [];
  } catch (error) {
    console.error('Failed to fetch duel for pin:', pinId, error);
    return [];
  }
}

// Submit a duel vote
export async function voteDuel({ pinId, winnerPhotoId, loserPhotoId }) {
  try {
    const headers = await getAuthHeader();
    const response = await axios.post(`${PUBLIC_BASE_URL}/vote_duel`, {
      pinId, winnerPhotoId, loserPhotoId
    }, { headers });
    return response.data;
  } catch (error) {
    console.error('Failed to submit duel vote:', error);
    return { success: false };
  }
}


/* 
Fetch all location pins. Returns an array of location pin objects.
*/
export async function fetchAllLocationPins() {
    try {
    const headers = await getAuthHeader();
    const response = await axios.get(`${PUBLIC_BASE_URL}/view_all_location_pins`, { headers });
    return response.data; // return list of all pins
    } catch (error) {
    console.error('Failed to fetch location pins:', error, 'This may have to do with .env.local file EXPO_PUBLIC_BASE_URL variable being stale');
    return [];
    }
};

/* Fetch user profile by UID */
export async function fetchUsersByUID(uid) {
  try {
    const headers = await getAuthHeader();
    const response = await axios.get(`${PUBLIC_BASE_URL}/users_by_uid/${uid}`, { headers });
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
    const headers = await getAuthHeader();
    const response = await axios.patch(
      `${PUBLIC_BASE_URL}/update_user_profile/${uid}`,
      updates,
      { headers }
    );
    console.log('Updated user profile for uid:', uid, response.data);
    return response.data; // updated user profile object
  } catch (error) {
    console.error('Failed to update user profile for uid:', uid, error);
    return null;
  }
}

// TODO: feels like I'm retyping auth headers a lot, a bit boilerplatey.
