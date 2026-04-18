import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useContext, useEffect, useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { AuthContext, AuthProvider } from '../hooks/AuthContext';
import CreateUsernameScreen from '../screens/CreateUsernameScreen';
import LoginScreen from '../screens/LoginScreen';
import '../config/logging';
import { useColorScheme } from '@/hooks/useColorScheme';
import { usePalette } from '@/hooks/usePalette';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initializeUploadQueue } from '@/lib/uploadQueue';

function RootLayoutContent() {
  const colorScheme = useColorScheme();
  const colors = usePalette();
  const { user, profile, loadingAuth, loadingProfile } = useContext(AuthContext);
  usePushNotifications(user);

  const navigationTheme = useMemo(() => {
    const baseTheme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        primary: colors.primary,
        background: colors.bg,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.primary,
      },
    };
  }, [colorScheme, colors]);

  useEffect(() => {
    if (!user?.uid) {
      return undefined;
    }
    return initializeUploadQueue();
  }, [user?.uid]);

  const shouldShowCreateUsernameGate = Boolean(user?.uid && !loadingProfile && !profile?.handle);
  const shouldShieldAuthedApp = Boolean(user?.uid && (loadingProfile || shouldShowCreateUsernameGate));

  // Show splash screen while loading / not authorized
  if (loadingAuth) {
    return (
      <>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
          <Image source={require('../assets/images/icon.png')} style={{ width: 200, height: 200 }} />
        </View>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} backgroundColor={colors.bg} />
      </>
    );
  }

  return (
    <ThemeProvider value={navigationTheme}>
      <>
        {user ? (
          <View style={styles.authedRoot}>
            <Stack
              screenOptions={{
                headerShown: false,
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false, title:"Map"}} />
              <Stack.Screen name="edit_profile" options={{ headerShown: false }} />
              <Stack.Screen name="friends" options={{ headerShown: false }} />
              <Stack.Screen name="user_profile/[uid]" options={{ headerShown: false }} />
              <Stack.Screen name="enter_message" options={{ title: 'Create a new Quest' }} />
              <Stack.Screen name="upload" options={{ title: 'Upload Photo' }} />
              <Stack.Screen
                name="view_photochallenge"
                options={{
                  title: 'View Quest',
                }} />
            </Stack>
            {shouldShieldAuthedApp ? <View pointerEvents="auto" style={[styles.authedShield, { backgroundColor: colors.surface }]} /> : null}
            {shouldShowCreateUsernameGate ? <View style={styles.gateWrap}><CreateUsernameScreen /></View> : null}
          </View>
        ) : (
          <LoginScreen />
        )}
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} backgroundColor={colors.bg} />
      </>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  authedRoot: {
    flex: 1,
  },
  authedShield: {
    ...StyleSheet.absoluteFillObject,
  },
  gateWrap: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <RootLayoutContent />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
