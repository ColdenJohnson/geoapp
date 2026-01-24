import { createContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';  // TODO: for production prefer expo-secure-store for tokens, or similar -- asyncstorage is plain key-value
import auth from '@react-native-firebase/auth';
import { fetchUsersByUID } from '@/lib/api';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);           // Firebase user
  const [profile, setProfile] = useState(null);     // Mongo profile
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    const unsubAuth = auth().onAuthStateChanged(async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setProfile(null);
        setLoadingAuth(false);
        await AsyncStorage.removeItem('user_token');
        return;
      }
      const idToken = await fbUser.getIdToken(true);
      setUser({
        uid: fbUser.uid,
        email: fbUser.email ?? null,
        phoneNumber: fbUser.phoneNumber ?? null,
        idToken,
      });
      await AsyncStorage.setItem('user_token', idToken);
      setLoadingAuth(false);
    });

    const unsubToken = auth().onIdTokenChanged(async (fbUser) => {
      if (fbUser) {
        const idToken = await fbUser.getIdToken();
        setUser((prev) => {
          const base = prev && prev.uid
            ? prev
            : { uid: fbUser.uid, email: fbUser.email ?? null, phoneNumber: fbUser.phoneNumber ?? null }; // if prev (user) is null, then create new base from fbUser
          return { ...base, idToken };
        });
        await AsyncStorage.setItem('user_token', idToken);
      }
    });

    return () => {
      unsubAuth();
      unsubToken();
    };
  }, []);

  useEffect(() => {
    async function loadProfile() {
      if (user?.uid) {
        const p = await fetchUsersByUID(user.uid);
        setProfile(p);
      } else {
        setProfile(null);
      }
    }
    loadProfile();
  }, [user?.uid]);

  return (
    <AuthContext.Provider value={{ user, setUser, profile, setProfile, loadingAuth }}>
      {children}
    </AuthContext.Provider>
  );
}
