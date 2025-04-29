import axios from 'axios';

const PUBLIC_BASE_URL = process.env.EXPO_PUBLIC_BASE_URL; 

export async function
createNewChallenge(location, file_url) {
    try {
      const response = await axios.post(`${PUBLIC_BASE_URL}/new_challenge`, {
        message: 'New Photo Challenge!',
        location: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        },
        file_url: file_url
      });
      console.log(`Location uploaded to server at ${location.coords.latitude}, ${location.coords.longitude}, with URL ${file_url}`);
      if (response.status !== 200) {
        console.error('Failed to send log to server');
      }
    } catch (error) {
      console.error('Error sending log to server:', error);
    }
  };

export async function
 fetchAllLocationPins() {
    try {
    const response = await axios.get(`${PUBLIC_BASE_URL}/view_all_location_pins`);
    return response.data; // return list of all pins
    } catch (error) {
    console.error('Failed to fetch location pins:', error);
    return [];
    }
};