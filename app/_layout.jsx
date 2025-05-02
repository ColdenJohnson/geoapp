import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { Image, View } from 'react-native';


import AsyncStorage from '@react-native-async-storage/async-storage';
// import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../config/firebase';
import LoginScreen from '../screens/LoginScreen';

import { useColorScheme } from '@/hooks/useColorScheme';



export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    const restoreSession = async () => {
      const token = await AsyncStorage.getItem('user_token');
      if (token) {
        // Optional: validate token with backend or just trust it
        setUser({ token }); // or call a function like setUserAsLoggedIn()
      }
      setLoadingAuth(false);
    };
    restoreSession();
  }, []);

  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // useEffect(() => {
  //   const unsubscribe = onAuthStateChanged(auth, (user) => {
  //     console.log('Auth state changed. User:', user);
  //     setUser(user);
  //     setLoadingAuth(false); // signal that auth check is done
  //   });
  //   return unsubscribe;
  // }, []);




  // if not loaded, show splash screen (logo)
  if (!loaded || loadingAuth) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Image source={require('../assets/images/icon.png')} style={{ width: 200, height: 200 }} />
      </View>
    );
  }

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
        <LoginScreen onLogin={(user) => setUser(user)} /> // this passes in onLogin as a prop to LoginScreen
      )}
    </ThemeProvider>
  );
}
