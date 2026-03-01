import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useContext } from 'react';
import { Image, View } from 'react-native';
import { AuthContext, AuthProvider } from '../hooks/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import '../config/logging';
import { useColorScheme } from '@/hooks/useColorScheme';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

function RootLayoutContent({ loaded }) {
  const colorScheme = useColorScheme();
  const { user, loadingAuth } = useContext(AuthContext);
  usePushNotifications(user);

  // Show splash screen while loading / not authorized
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
          <Stack
            screenOptions={{
              headerShown: false,
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false, title:"Map"}} />
            <Stack.Screen name="edit_profile" options={{ headerShown: false }} />
            <Stack.Screen name="friends" options={{ headerShown: false }} />
            <Stack.Screen name="enter_message" options={{ title: 'Create a new Quest' }} />
            <Stack.Screen name="upload" options={{ title: 'Upload Photo' }} />
            <Stack.Screen 
              name="view_photochallenge" 
              options={{ 
                title: 'View Quest',
              }} />
          </Stack>
          <StatusBar style="auto" />
        </>
      ) : (
        <LoginScreen />
      )}
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  return (
    <GestureHandlerRootView>
      <AuthProvider>
        <RootLayoutContent loaded={loaded} />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
