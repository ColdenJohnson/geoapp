// app/enter_message.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  View,
  Text,
  TextInput,
  StyleSheet,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  Pressable,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { useCameraPermission } from 'react-native-vision-camera';
import { FontAwesome6, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CTAButton } from '@/components/ui/Buttons';
import ChallengeCameraStage from '@/components/camera/ChallengeCameraStage';

import { usePalette } from '@/hooks/usePalette';
import { fontSizes, spacing, radii } from '@/theme/tokens';
import { goBackOrHome } from '@/lib/navigation';

import { resolveGeoLock, resolveMessage, resolveUpload } from '../lib/promiseStore';
import { enqueueNewChallengeUpload } from '@/lib/uploadQueue';

const MAX_LEN = 50;
const PHOTO_ASPECT_RATIO = 3 / 4;
const EXTRA_BOTTOM_BUFFER = spacing.md;
const BACK_BUTTON_HEIGHT = 20 + spacing.xs * 2;

export default function EnterMessageScreen({ initialUri = null }) {
  const [message, setMessage] = useState('');
  const [uri, setUri] = useState(initialUri);
  const [uploading, setUploading] = useState(false);
  const [isGeoLocked, setIsGeoLocked] = useState(false);
  const [showEmptyMessageError, setShowEmptyMessageError] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const router = useRouter();
  const { latitude: latitudeParam, longitude: longitudeParam } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { hasPermission, requestPermission } = useCameraPermission();
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isAtMaxLength = message.length >= MAX_LEN;
  const hasMessage = message.trim().length > 0;
  const inputRef = useRef(null);
  const isMounted = useRef(true);
  const didSubmitUpload = useRef(false);
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(1)).current;
  const contentBottomPadding = (keyboardVisible ? spacing.lg : spacing.sm) + insets.bottom + EXTRA_BOTTOM_BUFFER;
  const backButtonClearance = insets.top + spacing.sm + BACK_BUTTON_HEIGHT + spacing.sm;
  const challengeLocation = useMemo(() => {
    const latitude = Number(
      typeof latitudeParam === 'string'
        ? latitudeParam
        : Array.isArray(latitudeParam)
          ? latitudeParam[0]
          : NaN
    );
    const longitude = Number(
      typeof longitudeParam === 'string'
        ? longitudeParam
        : Array.isArray(longitudeParam)
          ? longitudeParam[0]
          : NaN
    );
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }
    return { coords: { latitude, longitude } };
  }, [latitudeParam, longitudeParam]);
  const handlePhotoPress = useCallback(() => {
    if (keyboardVisible) {
      Keyboard.dismiss();
    } else {
      inputRef.current?.focus();
    }
  }, [keyboardVisible]);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => {
      setKeyboardVisible(true);
      const height = e?.endCoordinates?.height ?? 0;
      Animated.timing(keyboardOffset, {
        toValue: -Math.max(0, height - spacing.lg),
        duration: 220,
        useNativeDriver: true,
      }).start();
      Animated.spring(cardScale, {
        toValue: 0.82,
        useNativeDriver: true,
        damping: 14,
        stiffness: 140,
      }).start();
    });
    const hideSub = Keyboard.addListener(hideEvt, () => {
      setKeyboardVisible(false);
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
      Animated.spring(cardScale, {
        toValue: 1,
        useNativeDriver: true,
        damping: 14,
        stiffness: 140,
      }).start();
    });
    return () => {
      showSub.remove();
      hideSub.remove();
      isMounted.current = false;
      if (!didSubmitUpload.current) {
        resolveMessage('');
        resolveUpload(null);
        resolveGeoLock(false);
      }
    };
  }, [cardScale, keyboardOffset]);

  const handleMessageChange = useCallback((value) => {
    setMessage(value);
    if (showEmptyMessageError) {
      setShowEmptyMessageError(false);
    }
  }, [showEmptyMessageError]);

  const renderBackButton = () => (
    <Pressable
      onPress={() => goBackOrHome(router)}
      style={[styles.backButton, { top: insets.top + spacing.sm }]}
      hitSlop={10}
    >
      <MaterialIcons name="arrow-back" size={20} color={colors.text} />
      <Text style={styles.backText}>Back</Text>
    </Pressable>
  );

  const handleUpload = async () => {
    if (!uri || uploading) return;
    const trimmed = message.trim();
    if (!trimmed) {
      setShowEmptyMessageError(true);
      setMessage('');
      inputRef.current?.focus();
      return;
    }
    setUploading(true);
    try {
      const queuedItem = await enqueueNewChallengeUpload({
        sourceUri: uri,
        message: trimmed,
        location: challengeLocation,
        isGeoLocked,
        photoLocation: challengeLocation,
      });
      didSubmitUpload.current = true;
      resolveMessage(trimmed);
      resolveGeoLock(isGeoLocked);
      resolveUpload({ queued: true, queueId: queuedItem.id });
      goBackOrHome(router);
    } catch (error) {
      console.error('Error queueing challenge photo', error);
      resolveUpload(null);
      Alert.alert('Upload failed', 'Unable to queue this challenge right now. Please try again.');
    } finally {
      if (isMounted.current) {
        setUploading(false);
      }
    }
  };

  const renderCamera = () => (
    <ChallengeCameraStage
      helperText="Snap a photo to start your challenge."
      onPhotoCaptured={setUri}
      disabled={uploading}
    />
  );

  const renderPreview = () => (
    <View style={styles.stage}>
      <Pressable onPress={handlePhotoPress} style={{ width: '100%' }}>
        <Animated.View style={[styles.card, { transform: [{ scale: cardScale }] }]}>
          <Image source={{ uri }} style={styles.photo} resizeMode="cover" cachePolicy="memory-disk" />
          <View style={[StyleSheet.absoluteFill, styles.cardOverlay]} pointerEvents="none" />
          <Pressable
            style={({ pressed }) => [
              styles.geoLockToggle,
              styles.geoLockToggleOverlay,
              pressed && { opacity: 0.7 },
              uploading && { opacity: 0.5 },
            ]}
            onPress={() => setIsGeoLocked((prev) => !prev)}
            disabled={uploading}
          >
            <FontAwesome6
              name={isGeoLocked ? 'square-check' : 'square'}
              size={18}
              color={isGeoLocked ? colors.primary : 'rgba(255,255,255,0.85)'}
            />
            <View style={styles.geoLockText}>
              <Text style={[styles.geoLockLabel, styles.geoLockLabelOverlay]}>Location locked</Text>
              <Text style={[styles.geoLockHint, styles.geoLockHintOverlay]}>
                {isGeoLocked
                  ? 'Only nearby users can join this challenge.'
                  : 'Anyone can join this challenge from anywhere.'}
              </Text>
            </View>
          </Pressable>
          <Pressable style={styles.closeButton} onPress={() => setUri(null)} hitSlop={12}>
            <FontAwesome6 name="xmark" size={18} color="#FFFFFF" />
          </Pressable>
        </Animated.View>
      </Pressable>
    </View>
  );

  if (!hasPermission) {
    return (
      <View style={[styles.container, styles.permissionGate]}>
        {renderBackButton()}
        <Text style={styles.title}>Camera access needed</Text>
        <Text style={styles.helper}>
          We need permission to capture your challenge photo.
        </Text>
        <CTAButton title="Continue" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        {renderBackButton()}
        {uri ? (
          <Animated.ScrollView
            style={[
              styles.scrollFrame,
              { paddingTop: backButtonClearance },
              { transform: [{ translateY: keyboardOffset }] },
            ]}
            contentContainerStyle={[
              styles.scrollContent,
              keyboardVisible && styles.scrollContentKeyboard,
              { paddingBottom: contentBottomPadding },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {renderPreview()}
            <View style={styles.noteBlock}>
              <TextInput
                ref={inputRef}
                value={message}
                onChangeText={handleMessageChange}
                placeholder="Write a short challenge prompt…"
                placeholderTextColor={showEmptyMessageError ? colors.danger : colors.textMuted}
                maxLength={MAX_LEN}
                returnKeyType="done"
                blurOnSubmit
                onSubmitEditing={Keyboard.dismiss}
                autoFocus
                style={[styles.input, isAtMaxLength && styles.inputMaxed]}
                textAlignVertical="top"
                multiline
              />
            </View>

            <View style={styles.actions}>
              <Pressable
                onPress={handleUpload}
                disabled={uploading}
                style={({ pressed }) => [
                  styles.createAction,
                  pressed && { opacity: 0.7 },
                  uploading && { opacity: 0.5 },
                  !hasMessage && { opacity: 0.45 },
                ]}
              >
                <Text style={styles.createText}>CREATE&gt;</Text>
              </Pressable>
            </View>
          </Animated.ScrollView>
        ) : (
          <Animated.View
            style={[
              styles.content,
              keyboardVisible && styles.contentKeyboard,
              { paddingTop: backButtonClearance + (keyboardVisible ? spacing.lg : spacing.sm) },
              { paddingBottom: contentBottomPadding },
              { transform: [{ translateY: keyboardOffset }] },
            ]}
          >
            {renderCamera()}
          </Animated.View>
        )}
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },
    permissionGate: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
    backButton: {
      position: 'absolute',
      left: spacing.md,
      zIndex: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.xs,
      paddingRight: spacing.sm,
      paddingLeft: spacing.xs,
    },
    backText: {
      color: colors.text,
      fontSize: fontSizes.sm,
      fontWeight: '800',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    content: {
      flex: 1,
      padding: spacing.sm,
      justifyContent: 'center',
      gap: spacing.lg,
    },
    contentKeyboard: {
      justifyContent: 'flex-start',
      paddingBottom: spacing.lg,
      paddingTop: spacing.lg,
    },
    scrollFrame: {
      flex: 1,
      padding: spacing.sm,
    },
    scrollContent: {
      flexGrow: 1,
      gap: spacing.lg,
      justifyContent: 'flex-start',
    },
    scrollContentKeyboard: {
      paddingTop: spacing.lg,
    },
    card: {
      width: '100%',
      maxWidth: 520,
      aspectRatio: PHOTO_ASPECT_RATIO,
      borderRadius: radii.lg,
      overflow: 'hidden',
      backgroundColor: colors.bg,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 18 },
      shadowRadius: 30,
      shadowOpacity: 0.18,
      elevation: 14,
      borderWidth: 1,
      borderColor: colors.barBorder,
    },
    photo: { ...StyleSheet.absoluteFillObject },
    cardOverlay: { backgroundColor: 'rgba(12,7,3,0.1)' },
    closeButton: {
      position: 'absolute',
      top: spacing.md,
      right: spacing.md,
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: 'rgba(12,7,3,0.48)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: 26,
      fontWeight: '900',
      color: colors.primary,
      textAlign: 'center',
      letterSpacing: 0.6,
      fontFamily: 'SpaceMono',
    },
    noteBlock: {
      width: '100%',
    },
    geoLockToggle: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      backgroundColor: colors.bg,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm + 2,
    },
    geoLockToggleOverlay: {
      position: 'absolute',
      left: spacing.sm,
      right: spacing.sm,
      bottom: spacing.sm,
      backgroundColor: 'rgba(12,7,3,0.52)',
      borderColor: 'rgba(255,255,255,0.24)',
    },
    geoLockText: {
      flex: 1,
      gap: 2,
    },
    geoLockLabel: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.text,
      textTransform: 'uppercase',
      letterSpacing: 0.45,
    },
    geoLockHint: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
      lineHeight: 15,
    },
    geoLockLabelOverlay: {
      color: '#FFFFFF',
    },
    geoLockHintOverlay: {
      color: 'rgba(255,255,255,0.84)',
    },
    input: {
      width: '100%',
      minHeight: 50,
      fontSize: 18,
      lineHeight: 22,
      backgroundColor: colors.bg,
      borderRadius: radii.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 10 },
      shadowRadius: 20,
      shadowOpacity: 0.12,
      elevation: 8,
      fontWeight: '600',
    },
    inputMaxed: { color: colors.danger },
    actions: { width: '100%', flexDirection: 'row', gap: spacing.md },
    createAction: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 0,
    },
    createText: {
      fontSize: 26,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: colors.primary,
      fontFamily: 'SpaceMono',
    },
    helper: { color: colors.textMuted, textAlign: 'center', fontWeight: '700', marginTop: spacing.sm },
  });
}
