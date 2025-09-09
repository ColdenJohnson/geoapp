import axios from 'axios';

const PUBLIC_BASE_URL = process.env.EXPO_PUBLIC_BASE_URL; 

export async function
newChallenge(location, file_url) {
  try {
    const response = await axios.post(`${PUBLIC_BASE_URL}/new_challenge`, {
      message: 'New Photo Challenge!',
      location: {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      },
      file_url: file_url
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


export async function addPhoto(pinId, file_url) {
  try {
    console.log('calling addPhoto with pin id:', pinId);
    const response = await axios.post(`${PUBLIC_BASE_URL}/add_photo`, {
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

export async function fetchPhotosByPinId(pinId) {
    try {
      const response = await axios.get(`${PUBLIC_BASE_URL}/view_photo_for_each_pin/${pinId}`);
      console.log('Fetched photos for pin:', pinId, response.data);
      return response.data; // array of photo objects
    } catch (error) {
      console.error('Failed to fetch photos for pin:', error);
      return [];
    }
  }




export async function
 fetchAllLocationPins() {
    try {
    const response = await axios.get(`${PUBLIC_BASE_URL}/view_all_location_pins`);
    return response.data; // return list of all pins
    } catch (error) {
    console.error('Failed to fetch location pins:', error, 'This may have to do with .env.local file EXPO_PUBLIC_BASE_URL variable being stale');
    return [];
    }
};