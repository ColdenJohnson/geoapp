import { storage } from '@/config/firebase';
import { ref, getDownloadURL } from 'firebase/storage';
import { useState, useEffect } from 'react';



export function useFirebaseImage(filename) {
    const [imageUrl, setImageUrl] = useState(null);
  
    useEffect(() => {
      async function fetchImage() {
        try {
          const imageRef = ref(storage, `images/${filename}`);
          const url = await getDownloadURL(imageRef);
          setImageUrl(url);
        } catch (error) {
          console.error("Failed to fetch image from Firebase:", error);
        }
      }
  
      if (filename) {
        fetchImage();
      } else {
        console.warn("Filename is undefined or null");
      }
    }, [filename]); // dependency array: reruns whenever filename changes
  
    return imageUrl;
  }