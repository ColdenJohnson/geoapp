import { createContext, useEffect, useState } from 'react';
import { fetchUsersByUID } from '@/lib/api';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);           // Firebase user
  const [profile, setProfile] = useState(null);     // Mongo profile
  const [loadingAuth, setLoadingAuth] = useState(true);

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
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, setUser, profile, setProfile, loadingAuth }}>
      {children}
    </AuthContext.Provider>
  );
}
