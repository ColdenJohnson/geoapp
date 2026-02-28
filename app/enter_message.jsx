// app/enter_message.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { FontAwesome6 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CTAButton } from '@/components/ui/Buttons';

import { usePalette } from '@/hooks/usePalette';
import { spacing, radii } from '@/theme/tokens';

import { resolveGeoLock, resolveMessage, resolveUpload } from '../lib/promiseStore';
import { uploadImage } from '@/lib/uploadHelpers';

const MAX_LEN = 50;
const PHOTO_RATIO = '9:16';
const PHOTO_ASPECT_RATIO = 9 / 16;
const EXTRA_BOTTOM_BUFFER = spacing.md;

export default function EnterMessageScreen({ initialUri = null }) {
  const [message, setMessage] = useState('');
  const [uri, setUri] = useState(initialUri);
  const [facing, setFacing] = useState('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [uploading, setUploading] = useState(false);
  const [isGeoLocked, setIsGeoLocked] = useState(true);
  const [showEmptyMessageError, setShowEmptyMessageError] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isAtMaxLength = message.length >= MAX_LEN;
  const hasMessage = message.trim().length > 0;
  const cameraRef = useRef(null);
  const inputRef = useRef(null);
  const isMounted = useRef(true);
  const didSubmitUpload = useRef(false);
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(1)).current;
  const contentBottomPadding = (keyboardVisible ? spacing.lg : spacing.sm) + insets.bottom + EXTRA_BOTTOM_BUFFER;
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
        resolveGeoLock(true);
      }
    };
  }, [cardScale, keyboardOffset]);

  const toggleFacing = () => {
    setFacing((prev) => (prev === 'back' ? 'front' : 'back'));
  };

  const takePicture = async () => {
    if (uploading) return;
    const photo = await cameraRef.current?.takePictureAsync({
      skipProcessing: true,
      ratio: PHOTO_RATIO,
    });
    setUri(photo?.uri ?? null);
  };

  const handleMessageChange = useCallback((value) => {
    setMessage(value);
    if (showEmptyMessageError) {
      setShowEmptyMessageError(false);
    }
  }, [showEmptyMessageError]);

  // TODO: Surface upload failures and validation errors to the user instead of only logging.
  const handleUpload = () => {
    if (!uri || uploading) return;
    const trimmed = message.trim();
    if (!trimmed) {
      setShowEmptyMessageError(true);
      setMessage('');
      inputRef.current?.focus();
      return;
    }
    didSubmitUpload.current = true;

    resolveMessage(trimmed);
    resolveGeoLock(isGeoLocked);
    setUploading(true);

    (async () => {
      try {
        const downloadURL = await uploadImage(uri);
        resolveUpload(downloadURL);
      } catch (error) {
        console.error('Error uploading challenge photo', error);
        resolveUpload(null);
      } finally {
        if (isMounted.current) {
          setUploading(false);
        }
      }
    })();

    router.back();
  };

  const renderCamera = () => (
    <View style={styles.stage}>
      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          ref={cameraRef}
          facing={facing}
          mute={false}
          responsiveOrientationWhenOrientationLocked
          ratio={PHOTO_RATIO}
        />
        <View style={styles.cameraControlsOverlay} pointerEvents="box-none">
          <View style={styles.shutterContainer}>
            <View style={styles.flipButtonPlaceholder} />
            <Pressable onPress={takePicture}>
              {({ pressed }) => (
                <View
                  style={[
                    styles.shutterBtn,
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <View
                    style={styles.shutterBtnInner}
                  />
                </View>
              )}
            </Pressable>
            <Pressable onPress={toggleFacing} style={styles.flipButton}>
              <FontAwesome6 name="rotate-left" size={24} color={colors.text} />
            </Pressable>
          </View>
        </View>
      </View>
      <Text style={styles.helper}>Snap a photo to start your challenge.</Text>
    </View>
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

  if (!permission || !permission.granted) {
    return (
      <View style={[styles.container, styles.permissionGate]}>
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
      <View style={styles.container}>
        {uri ? (
          <Animated.ScrollView
            style={[
              styles.scrollFrame,
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
              { paddingBottom: contentBottomPadding },
              { transform: [{ translateY: keyboardOffset }] },
            ]}
          >
            {renderCamera()}
          </Animated.View>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },
    permissionGate: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
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
    stage: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cameraContainer: {
      width: '100%',
      aspectRatio: PHOTO_ASPECT_RATIO,
      overflow: 'hidden',
      borderRadius: radii.lg,
      backgroundColor: 'black',
      position: 'relative',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 16 },
      shadowRadius: 28,
      shadowOpacity: 0.16,
      elevation: 14,
      borderWidth: 1,
      borderColor: colors.barBorder,
    },
    camera: {
      flex: 1,
    },
    cameraControlsOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-end',
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    shutterContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
    },
    shutterBtn: {
      borderWidth: 3,
      borderColor: colors.primary,
      width: 82,
      height: 82,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 18,
      shadowOpacity: 0.14,
      elevation: 8,
    },
    shutterBtnInner: {
      width: 56,
      height: 56,
      borderRadius: 16,
      backgroundColor: colors.primary,
    },
    flipButtonPlaceholder: {
      width: 44,
      height: 44,
    },
    flipButton: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(12,7,3,0.48)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
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
