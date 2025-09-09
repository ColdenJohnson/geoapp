
// NOTE: TO RUN USE THIS TERMINAL COMMAND: EXPO_PUBLIC_BASE_URL=http://192.168.86.29:3500 node testAPI_temporaryscript.js

import { newChallenge, addPhoto, fetchPhotosByPinId, fetchAllLocationPins } from './lib/api.js';

async function main() {
  // Example: test fetching all pins
  const pinId = '68bf765b30570f70a5ab0e39';

  fetchPhotosByPinId(pinId).then(data => {
    console.log('Photos:', data);
  });


}

main();
