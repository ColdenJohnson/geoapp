import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { VideoView, useVideoPlayer } from 'expo-video';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthContext, AuthProvider } from '../hooks/AuthContext';
import CreateUsernameScreen from '../screens/CreateUsernameScreen';
import LoginScreen from '../screens/LoginScreen';
import '../config/logging';
import { useColorScheme } from '@/hooks/useColorScheme';
import { usePalette } from '@/hooks/usePalette';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initializeUploadQueue } from '@/lib/uploadQueue';
import { AchievementCelebrationModal } from '@/components/ui/AchievementCelebrationModal';
import { getAchievementDefinition } from '@/lib/achievements';

const INTRO_VIDEO_SEEN_STORAGE_KEY = 'app_intro_video_seen_v2';
const FORCE_INTRO_VIDEO = process.env.EXPO_PUBLIC_FORCE_STARTUP_VIDEO === 'true';

function IntroVideoGate({ onComplete }) {
  const [didFinishVideo, setDidFinishVideo] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const introPlayer = useVideoPlayer(require('../assets/videos/intro.mp4'), (player) => {
    player.loop = false;
    player.audioMixingMode = 'auto';
    player.staysActiveInBackground = false;
    player.play();
  });

  useEffect(() => {
    introPlayer.muted = !isSoundEnabled;
  }, [introPlayer, isSoundEnabled]);

  useEffect(() => {
    const playToEndSubscription = introPlayer.addListener('playToEnd', () => {
      setDidFinishVideo(true);
      introPlayer.pause();
    });
    return () => {
      playToEndSubscription.remove();
    };
  }, [introPlayer]);

  const handleToggleSound = useCallback(() => {
    setIsSoundEnabled((prev) => !prev);
  }, []);

  const handleReplay = useCallback(() => {
    setDidFinishVideo(false);
    introPlayer.currentTime = 0;
    introPlayer.play();
  }, [introPlayer]);

  return (
    <View style={styles.introRoot}>
      <VideoView contentFit="cover" nativeControls={false} player={introPlayer} style={styles.introVideo} />
      <Pressable onPress={didFinishVideo ? onComplete : undefined} style={styles.introTapToSkipLayer} />
      <View pointerEvents="box-none" style={styles.introOverlay}>
        <View style={styles.introLeftControls}>
          <Pressable onPress={handleToggleSound} style={styles.introIconButton}>
            <MaterialIcons
              name={isSoundEnabled ? 'volume-up' : 'volume-off'}
              size={22}
              color="#fff"
            />
          </Pressable>
          {didFinishVideo ? (
            <Pressable onPress={handleReplay} style={[styles.introIconButton, styles.introReplayButton]}>
              <MaterialIcons name="replay" size={22} color="#fff" />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.introBottomCtaWrap}>
          <Pressable onPress={onComplete} style={styles.introCtaButton}>
            <Text style={styles.introCtaText}>{didFinishVideo ? 'NEXT>' : 'SKIP>'}</Text>
          </Pressable>
        </View>
      </View>
      <StatusBar style="light" backgroundColor="#000" />
    </View>
  );
}

function RootLayoutContent() {
  const colorScheme = useColorScheme();
  const colors = usePalette();
  const [isLoadingIntroGate, setIsLoadingIntroGate] = useState(true);
  const [shouldShowIntroGate, setShouldShowIntroGate] = useState(false);
  const introDismissedRef = useRef(false);
  const {
    user,
    profile,
    loadingAuth,
    loadingProfile,
    achievementCatalog,
    achievementCelebration,
    dismissAchievementCelebration,
  } = useContext(AuthContext);
  usePushNotifications(user);

  useEffect(() => {
    let isActive = true;
    const hydrateIntroGate = async () => {
      try {
        const hasSeenIntroVideo = await AsyncStorage.getItem(INTRO_VIDEO_SEEN_STORAGE_KEY);
        if (!isActive) {
          return;
        }
        setShouldShowIntroGate(FORCE_INTRO_VIDEO || hasSeenIntroVideo !== 'true');
      } catch (error) {
        if (!isActive) {
          return;
        }
        console.warn('Failed to load intro video state', error);
        setShouldShowIntroGate(false);
      } finally {
        if (isActive) {
          setIsLoadingIntroGate(false);
        }
      }
    };

    hydrateIntroGate();
    return () => {
      isActive = false;
    };
  }, []);

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

  useEffect(() => {
    if (!getAchievementDefinition(achievementCatalog, achievementCelebration?.id)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  }, [achievementCatalog, achievementCelebration]);

  useEffect(() => {
    if (!user?.uid || FORCE_INTRO_VIDEO) {
      return;
    }
    setShouldShowIntroGate(false);
    AsyncStorage.setItem(INTRO_VIDEO_SEEN_STORAGE_KEY, 'true').catch((error) => {
      console.warn('Failed to persist intro video state', error);
    });
  }, [user?.uid]);

  const handleCompleteIntroGate = useCallback(() => {
    if (introDismissedRef.current) {
      return;
    }
    introDismissedRef.current = true;
    setShouldShowIntroGate(false);
  }, []);

  const shouldShowCreateUsernameGate = Boolean(user?.uid && !loadingProfile && !profile?.handle);
  const shouldShieldAuthedApp = Boolean(user?.uid && (loadingProfile || shouldShowCreateUsernameGate));

  // Show splash screen while loading / not authorized
  if (loadingAuth || isLoadingIntroGate) {
    return (
      <>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
          <Image source={require('../assets/images/icon.png')} style={{ width: 200, height: 200 }} />
        </View>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} backgroundColor={colors.bg} />
      </>
    );
  }

  if (shouldShowIntroGate) {
    return <IntroVideoGate onComplete={handleCompleteIntroGate} />;
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
              <Stack.Screen name="admin/quest-tags" options={{ headerShown: false }} />
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
            <AchievementCelebrationModal
              achievement={achievementCelebration}
              achievementCatalog={achievementCatalog}
              colors={colors}
              visible={!!getAchievementDefinition(achievementCatalog, achievementCelebration?.id)}
              onClose={dismissAchievementCelebration}
            />
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
  introRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  introVideo: {
    ...StyleSheet.absoluteFillObject,
  },
  introTapToSkipLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  introOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    alignItems: 'stretch',
    paddingTop: 52,
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  introLeftControls: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
  },
  introBottomCtaWrap: {
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  introIconButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introReplayButton: {
    marginLeft: 12,
  },
  introCtaButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 8,
  },
  introCtaText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 1.2,
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
