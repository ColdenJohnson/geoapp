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

import { CTAButton, SecondaryButton } from '@/components/ui/Buttons';

import { usePalette } from '@/hooks/usePalette';
import { spacing, radii } from '@/theme/tokens';

import { resolveMessage, resolveUpload } from '../lib/promiseStore';
import { uploadImage } from '@/lib/uploadHelpers';

const MAX_LEN = 50;

export default function EnterMessageScreen({ initialUri = null }) {
  const [message, setMessage] = useState('');
  const [uri, setUri] = useState(initialUri);
  const [facing, setFacing] = useState('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [uploading, setUploading] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const router = useRouter();
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const remaining = useMemo(() => MAX_LEN - message.length, [message]);
  const cameraRef = useRef(null);
  const inputRef = useRef(null);
  const isMounted = useRef(true);
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(1)).current;
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
    };
  }, [cardScale, keyboardOffset]);

  const toggleFacing = () => {
    setFacing((prev) => (prev === 'back' ? 'front' : 'back'));
  };

  const takePicture = async () => {
    if (uploading) return;
    const photo = await cameraRef.current?.takePictureAsync({
      skipProcessing: true,
      ratio: '4:3',
    });
    setUri(photo?.uri ?? null);
  };

  // TODO: Surface upload failures and validation errors to the user instead of only logging.
  const handleUpload = () => {
    if (!uri || uploading) return;
    const trimmed = message.trim();

    resolveMessage(trimmed);
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
          ratio="4:3"
        />
        <View style={styles.shutterContainer}>
          <View style={{ width: 32 }} />

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
          <Pressable onPress={toggleFacing}>
            <FontAwesome6 name="rotate-left" size={28} color={colors.text} />
          </Pressable>
        </View>
      </View>
    </View>
  );

  const renderPreview = () => (
    <View style={styles.stage}>
      <Pressable onPress={handlePhotoPress} style={{ width: '100%' }}>
        <Animated.View style={[styles.card, { transform: [{ scale: cardScale }] }]}>
          <Image source={{ uri }} style={styles.photo} resizeMode="cover" cachePolicy="memory-disk" />
          <View style={[StyleSheet.absoluteFill, styles.cardOverlay]} pointerEvents="none" />
          <View style={styles.photoBadge}>
            <Text style={styles.photoBadgeText}>Captured photo</Text>
          </View>
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
        <Animated.View
          style={[styles.content, keyboardVisible && styles.contentKeyboard, { transform: [{ translateY: keyboardOffset }] }]}
        >
          <Text style={styles.title}>Create a new challenge</Text>

          {uri ? renderPreview() : renderCamera()}

          {uri ? (
            <>
              <Text style={styles.subtitle}>Add a challenge note</Text>

              <TextInput
                ref={inputRef}
                value={message}
                onChangeText={setMessage}
                placeholder="Write a short challenge prompt…"
                placeholderTextColor={colors.textMuted}
                maxLength={MAX_LEN}
                returnKeyType="done"
                blurOnSubmit
                onSubmitEditing={Keyboard.dismiss}
                autoFocus
                style={styles.input}
                textAlignVertical="top"
                multiline
              />

              <Text style={[styles.counter, remaining < 0 && styles.counterOver]}>
                {remaining}
              </Text>

              <View style={styles.actions}>
                <SecondaryButton title="Retake Photo" onPress={() => setUri(null)} style={{ flex: 1 }} />
                <CTAButton title="Upload" onPress={handleUpload} style={{ flex: 1 }} disabled={uploading} />
              </View>
            </>
          ) : (
            <Text style={styles.helper}>Snap a photo to start your challenge.</Text>
          )}
        </Animated.View>
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
      padding: spacing.lg,
      justifyContent: 'center',
      gap: spacing.md,
    },
    contentKeyboard: {
      justifyContent: 'flex-start',
      paddingBottom: spacing.lg,
      paddingTop: spacing.sm,
    },
    stage: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cameraContainer: {
      width: '100%',
      aspectRatio: 3 / 4,
      overflow: 'hidden',
      borderRadius: radii.lg,
      backgroundColor: 'black',
      position: 'relative',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 12 },
      shadowRadius: 22,
      shadowOpacity: 0.18,
      elevation: 10,
    },
    camera: {
      flex: 1,
    },
    shutterContainer: {
      position: 'absolute',
      bottom: 18,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg + 4,
    },
    shutterBtn: {
      backgroundColor: 'transparent',
      borderWidth: 4,
      borderColor: colors.text,
      width: 78,
      height: 78,
      borderRadius: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    shutterBtnInner: {
      width: 62,
      height: 62,
      borderRadius: 44,
      backgroundColor: colors.surface,
    },
    card: {
      width: '100%',
      maxWidth: 520,
      aspectRatio: 3 / 4,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: colors.bg,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 12 },
      shadowRadius: 24,
      shadowOpacity: 0.2,
      elevation: 12,
    },
    photo: { ...StyleSheet.absoluteFillObject },
    cardOverlay: { backgroundColor: 'rgba(0,0,0,0.05)' },
    photoBadge: {
      position: 'absolute',
      top: spacing.md,
      left: spacing.md,
      paddingVertical: 6,
      paddingHorizontal: spacing.md,
      backgroundColor: 'rgba(0,0,0,0.4)',
      borderRadius: radii.pill,
    },
    photoBadgeText: { color: '#FFFFFF', fontWeight: '700', letterSpacing: 0.3 },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginTop: spacing.sm,
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
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 16,
      shadowOpacity: 0.08,
      elevation: 6,
    },
    counter: {
      alignSelf: 'flex-end',
      fontSize: 12,
      color: colors.textMuted,
    },
    counterOver: { color: colors.danger },
    actions: { width: '100%', flexDirection: 'row', gap: spacing.md },
    helper: { color: colors.textMuted, textAlign: 'center' },
  });
}
