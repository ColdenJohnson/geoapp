import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../config/firebase';
import LoginScreen from '../screens/LoginScreen';

import { useColorScheme } from '@/hooks/useColorScheme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('Auth state changed. User:', user);
      setUser(user);
      setLoadingAuth(false); // signal that auth check is done
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (loaded && !loadingAuth) {
      SplashScreen.hideAsync();
    }
  }, [loaded, loadingAuth]);

  return (
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
  );
}
