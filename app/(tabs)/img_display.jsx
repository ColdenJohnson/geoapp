import { StyleSheet, Image } from 'react-native';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import { useState, useEffect } from 'react';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

// Custom React Hook to fetch image URL
export default function useFirebaseImage(filename) {
  const [imageUrl, setImageUrl] = useState(null);

  useEffect(() => {
    async function fetchImage() {
      try {
        const storage = getStorage(); // Make sure Firebase is initialized somewhere
        filename = "michael_cornell_sexy.jpeg";
        const imageRef = ref(storage, `images/${filename}`);
        const url = await getDownloadURL(imageRef);
        setImageUrl(url);
      } catch (error) {
        console.error("Failed to fetch image from Firebase:", error);
      }
    }

    if (filename) {
      fetchImage();
    }
  }, [filename]);

  return imageUrl;
}