
// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';



// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCcrsL_8rLBcl5XlBbgCXFfePEZvdnz60E",
  authDomain: "geoapp-fb.firebaseapp.com",
  projectId: "geoapp-fb",
  storageBucket: 'geoapp-fb.appspot.com', // geoapp-fb.appspot.com" or "geoapp-fb.firebasestorage.app" -- unsure which
  messagingSenderId: "834952308922",
  appId: "1:834952308922:web:e9b54816f1e1b2cb03fa83",
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp(); // if no apps are initialized, initialize one

const storage = getStorage(app);
export { storage };
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});


console.log('Initializing Firebase...');
console.log('app:', app);
console.log('auth:', auth);
console.log('auth.currentUser:', auth?.currentUser);