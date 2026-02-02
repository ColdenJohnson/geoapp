import { createContext, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';  // TODO: for production prefer expo-secure-store for tokens, or similar -- asyncstorage is plain key-value
import auth from '@react-native-firebase/auth';
import { fetchUsersByUID, fetchFriends, fetchFriendRequests, fetchUserStats } from '@/lib/api';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);           // Firebase user
  const [profile, setProfile] = useState(null);     // Mongo profile
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState({ incoming: [], outgoing: [] });
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsDirty, setFriendsDirty] = useState(false);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsDirty, setStatsDirty] = useState(false);
  const preloadRef = useRef({ friends: false, stats: false });

  const friendsCacheKey = (uid) => `friends_cache_${uid}`;
  const statsCacheKey = (uid) => `stats_cache_${uid}`;

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
        if (p?.photo_url) {
          Image.prefetch(p.photo_url).catch((error) => {
            console.warn('Failed to prefetch profile photo', error);
          });
        }
        setProfile(p);
      } else {
        setProfile(null);
      }
    }
    loadProfile();
  }, [user?.uid]);

  useEffect(() => {
    preloadRef.current = { friends: false, stats: false };
  }, [user?.uid]);

  useEffect(() => {
    async function loadFriendsCache() {
      if (!user?.uid) {
        setFriends([]);
        setFriendRequests({ incoming: [], outgoing: [] });
        return;
      }
      const raw = await AsyncStorage.getItem(friendsCacheKey(user.uid));
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.friends)) setFriends(parsed.friends);
        if (parsed?.friendRequests) setFriendRequests(parsed.friendRequests);
      } catch (error) {
        console.warn('Failed to parse friends cache', error);
      }
    }
    loadFriendsCache();
  }, [user?.uid]);

  useEffect(() => {
    async function loadStatsCache() {
      if (!user?.uid) {
        setStats(null);
        return;
      }
      const raw = await AsyncStorage.getItem(statsCacheKey(user.uid));
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.stats) setStats(parsed.stats);
      } catch (error) {
        console.warn('Failed to parse stats cache', error);
      }
    }
    loadStatsCache();
  }, [user?.uid]);

  async function refreshFriends({ force = false } = {}) {
    if (!user?.uid) return null;
    if (friendsLoading) return null;
    if (!force && !friendsDirty) return null;
    setFriendsLoading(true);
    try {
      const [friendsData, requestsData] = await Promise.all([
        fetchFriends(),
        fetchFriendRequests()
      ]);
      const nextFriends = Array.isArray(friendsData) ? friendsData : [];
      const nextRequests = requestsData || { incoming: [], outgoing: [] };
      setFriends(nextFriends);
      setFriendRequests(nextRequests);
      setFriendsDirty(false);
      await AsyncStorage.setItem(
        friendsCacheKey(user.uid),
        JSON.stringify({ friends: nextFriends, friendRequests: nextRequests })
      );
      return nextFriends;
    } finally {
      setFriendsLoading(false);
    }
  }

  async function refreshStats({ force = false } = {}) {
    if (!user?.uid) return null;
    if (statsLoading) return null;
    if (!force && !statsDirty) return null;
    setStatsLoading(true);
    try {
      const data = await fetchUserStats(user.uid);
      if (data) {
        setStats(data);
        setStatsDirty(false);
        await AsyncStorage.setItem(
          statsCacheKey(user.uid),
          JSON.stringify({ stats: data })
        );
      }
      return data;
    } finally {
      setStatsLoading(false);
    }
  }

  const invalidateFriends = () => {
    setFriendsDirty(true);
    refreshFriends({ force: true });
  };

  const invalidateStats = () => {
    setStatsDirty(true);
    refreshStats({ force: true });
  };

  useEffect(() => {
    if (!user?.uid) return;
    if (!preloadRef.current.friends) {
      preloadRef.current.friends = true;
      refreshFriends({ force: true });
    }
    if (!preloadRef.current.stats) {
      preloadRef.current.stats = true;
      refreshStats({ force: true });
    }
  }, [user?.uid]);

  return (
    <AuthContext.Provider value={{
      user,
      setUser,
      profile,
      setProfile,
      loadingAuth,
      friends,
      friendRequests,
      friendsLoading,
      stats,
      statsLoading,
      refreshFriends,
      refreshStats,
      invalidateFriends,
      invalidateStats
    }}>
      {children}
    </AuthContext.Provider>
  );
}
