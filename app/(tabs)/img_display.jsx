import { storage } from '@/config/firebase';
import { Image } from 'react-native';
import { ref, getDownloadURL } from 'firebase/storage';
import { useState, useEffect } from 'react';

// Custom Hook
export function useFirebaseImage(filename) {
  const [imageUrl, setImageUrl] = useState(null);

  useEffect(() => {
    async function fetchImage() {
      console.log("Starting fetchImage...");
      try {
        console.log("Fetching image with filename:", filename);
        const imageRef = ref(storage, `images/${filename}`);
        const url = await getDownloadURL(imageRef);
        console.log("Successfully fetched image URL:", url);
        setImageUrl(url);
      } catch (error) {
        console.error("Failed to fetch image from Firebase:", error);
      }
    }

    if (filename) {
      console.log("Filename exists, calling fetchImage");
      fetchImage();
    } else {
      console.warn("Filename is undefined or null");
    }
  }, [filename]); // dependency array: reruns whenever filename changes

  return imageUrl;
}

// Proper Component
export default function ImgDisplay({ filename }) {
  const imageUrl = useFirebaseImage(filename || "michael_cornell_sexy.jpeg");

  if (!imageUrl) {
    console.warn("No imageUrl yet, returning null");
    return null; // or you can return a loading spinner here
  }

  console.log("Rendering image with URL:", imageUrl);

  return (
    <Image
      source={{ uri: imageUrl }}
      style={{ width: 200, height: 200 }}
      resizeMode="contain"
    />
  );
}
