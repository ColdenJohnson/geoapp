import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';  // TODO: for production prefer expo-secure-store for tokens, or similar -- asyncstorage is plain key-value
import { AuthContext } from '../hooks/AuthContext';
import { onAuthStateChanged, onIdTokenChanged } from 'firebase/auth';
import { auth } from '../config/firebase';
import LoginScreen from '../screens/LoginScreen';
import { useColorScheme } from '@/hooks/useColorScheme';
import { fetchUsersByUID } from '@/lib/api';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [ profile, setProfile] = useState(null);

  // Listen for user sign-in/out and keep ID token fresh
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setProfile(null);
        setLoadingAuth(false);
        await AsyncStorage.removeItem('user_token');
        return;
      }
      const idToken = await fbUser.getIdToken(true);
      setUser({ uid: fbUser.uid, email: fbUser.email ?? null, idToken });
      await AsyncStorage.setItem('user_token', idToken);
      setLoadingAuth(false);
    });

    const unsubToken = onIdTokenChanged(auth, async (fbUser) => {
      if (fbUser) {
      const idToken = await fbUser.getIdToken();
        setUser((prev) => {
        const base = prev && prev.uid ? prev : { uid: fbUser.uid, email: fbUser.email ?? null }; // if prev (user) is null, then create new base from fbUser
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


  // Fetch Mongo UserProfile when we have a signed-in user
  useEffect(() => {
    (async function loadProfile() {
      if (!user?.uid) {
        console.log('No UID, so no profile, ', user);
        setProfile(null);
        return;
      }
      try {
        const p = await fetchUsersByUID(user.uid);
        setProfile(p);
      } catch (error) {
        console.error('Error fetching user profile:', error);
      }
    })();
  }, [user?.uid]);

  // Show splash screen while loading / not authorized
  if (!loaded || loadingAuth) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Image source={require('../assets/images/icon.png')} style={{ width: 200, height: 200 }} />
      </View>
    );
  }

  return (
    <AuthContext.Provider value={{ user, setUser, profile, setProfile, loadingAuth }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        {user ? (
          <>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            </Stack>
            <StatusBar style="auto" />
          </>
        ) : (
          <LoginScreen />
        )}
      </ThemeProvider>
    </AuthContext.Provider>
  );
}