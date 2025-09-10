import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthContext } from '../hooks/AuthContext';
import { onAuthStateChanged, onIdTokenChanged } from 'firebase/auth';
import { auth } from '../config/firebase';
import LoginScreen from '../screens/LoginScreen';
import { useColorScheme } from '@/hooks/useColorScheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Listen for user sign-in/out and keep ID token fresh
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
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
        setUser((u) => (u ? { ...u, idToken } : u));
        await AsyncStorage.setItem('user_token', idToken);
      }
    });

    return () => {
      unsubAuth();
      unsubToken();
    };
  }, []);

  if (!loaded || loadingAuth) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Image source={require('../assets/images/icon.png')} style={{ width: 200, height: 200 }} />
      </View>
    );
  }

  return (
    <AuthContext.Provider value={{ user, setUser, loadingAuth }}>
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