import * as Location from 'expo-location';
import { useState, useRef, useMemo, useEffect, useContext } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useCameraPermission } from 'react-native-vision-camera';
import { FontAwesome6, MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { resolveUpload, resolveUploadSubmit } from '../lib/promiseStore';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { usePalette } from '@/hooks/usePalette';
import { CTAButton } from '@/components/ui/Buttons';
import ChallengeCameraStage from '@/components/camera/ChallengeCameraStage';
import { fontSizes, spacing, radii } from '@/theme/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { goBackOrHome, buildViewPhotoChallengeRoute } from '@/lib/navigation';
import { AuthContext } from '@/hooks/AuthContext';
import { enqueueAddPhotoUpload } from '@/lib/uploadQueue';

const PHOTO_ASPECT_RATIO = 3 / 4;
const EXTRA_BOTTOM_BUFFER = spacing.md;
const BACK_BUTTON_HEIGHT = 20 + spacing.xs * 2;

function normalizeCoordinate(value) {
  const latitude = Number(value?.coords?.latitude ?? value?.latitude);
  const longitude = Number(value?.coords?.longitude ?? value?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return { latitude, longitude };
}

async function getApproximatePhotoLocation() {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission?.status !== 'granted') {
      return null;
    }

    const lastKnownPosition = await Location.getLastKnownPositionAsync();
    const lastKnownCoords = normalizeCoordinate(lastKnownPosition);
    if (lastKnownCoords) {
      return lastKnownCoords;
    }

    const currentPosition = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return normalizeCoordinate(currentPosition);
  } catch (error) {
    console.warn('Failed to read photo location', error);
    return null;
  }
}

export default function Upload({ initialUri = null }) {
  const [uri, setUri] = useState(initialUri);
  const [uploading, setUploading] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { hasPermission, requestPermission } = useCameraPermission();
  const {
    next,
    prompt,
    uploadRequestId,
    pinId: pinIdParam,
    created_by_handle: createdByHandleParam,
  } = useLocalSearchParams();
  const promptText = useMemo(() => {
    if (typeof prompt === 'string') return prompt.trim();
    if (Array.isArray(prompt) && typeof prompt[0] === 'string') return prompt[0].trim();
    return '';
  }, [prompt]);
  const nextPath = useMemo(() => {
    if (typeof next === 'string') return next.trim();
    if (Array.isArray(next) && typeof next[0] === 'string') return next[0].trim();
    return '';
  }, [next]);
  const pinId = useMemo(() => {
    if (typeof pinIdParam === 'string') return pinIdParam.trim();
    if (Array.isArray(pinIdParam) && typeof pinIdParam[0] === 'string') return pinIdParam[0].trim();
    return '';
  }, [pinIdParam]);
  const createdByHandle = useMemo(() => {
    if (typeof createdByHandleParam === 'string') return createdByHandleParam.trim();
    if (Array.isArray(createdByHandleParam) && typeof createdByHandleParam[0] === 'string') {
      return createdByHandleParam[0].trim();
    }
    return '';
  }, [createdByHandleParam]);
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isMounted = useRef(true);
  const didSubmitUpload = useRef(false);
  const backButtonClearance = insets.top + spacing.sm + BACK_BUTTON_HEIGHT;
  const { profile } = useContext(AuthContext);

  useEffect(() => () => {
    isMounted.current = false;
    if (!didSubmitUpload.current) {
      if (typeof uploadRequestId === 'string' && uploadRequestId) {
        resolveUpload(null, uploadRequestId);
        resolveUploadSubmit(null, uploadRequestId);
      } else {
        resolveUpload(null);
        resolveUploadSubmit(null);
      }
    }
  }, [uploadRequestId]);

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

  // For Dev

  // useEffect(() => {
  //   const checkIfEmulator = async () => {
  //     const isEmulator = await DeviceInfo.isEmulator();
  //     if (__DEV__ && Platform.OS === 'ios' && isEmulator) {
  //       console.log("Mocking camera photo for emulator.");
  //       setUri(mockImage); // or local asset
  //     }
  //   };
  //   checkIfEmulator();
  // }, []);

  // async function uploadMockImage() {
  //   try {
  //     const asset = Asset.fromModule(mockImage);
  //     await asset.downloadAsync();
  
  //     const response = await fetch(asset.localUri);
  //     const blob = await response.blob();
  
  //     const ref = storage().ref('images/michael_cornell_sexy.jpeg');
  //     await ref.put(blob);
  
  //     console.log('Upload successful');
  //   } catch (err) {
  //     console.error('Upload failed:', err);
  //   }
  // }
  // For Dev

  if (!hasPermission) {
    return (
      <View style={[styles.container, styles.permissionGate]}>
        {renderBackButton()}
        <Text style={styles.message}>We need your permission to show the camera for SideQuest photo upload to work properly.</Text>
        <CTAButton title="Continue" onPress={requestPermission} />
      </View>
    );
  }

  const handleUpload = async () => {
    if (!uri || uploading) return;
    setUploading(true);
    try {
      const photoLocation = await getApproximatePhotoLocation();
      await enqueueAddPhotoUpload({
        sourceUri: uri,
        pinId,
        createdByHandle:
          typeof profile?.handle === 'string' && profile.handle
            ? profile.handle
            : 'you',
        queueId: typeof uploadRequestId === 'string' && uploadRequestId ? uploadRequestId : null,
        photoLocation,
      });

      didSubmitUpload.current = true;
      if (typeof uploadRequestId === 'string' && uploadRequestId) {
        resolveUploadSubmit({ submitted: true }, uploadRequestId);
        resolveUpload({ queued: true, queueId: uploadRequestId, photoLocation }, uploadRequestId);
      } else {
        resolveUploadSubmit({ submitted: true });
        resolveUpload({ queued: true, photoLocation });
      }

      if (nextPath === '/view_photochallenge' && pinId) {
        router.push(buildViewPhotoChallengeRoute({
          pinId,
          message: promptText,
          createdByHandle,
        }));
      } else if (nextPath) {
        router.push(String(nextPath));
      } else {
        goBackOrHome(router);
      }
    } catch (error) {
      console.error('Failed to queue image upload', error);
      if (typeof uploadRequestId === 'string' && uploadRequestId) {
        resolveUpload(null, uploadRequestId);
      } else {
        resolveUpload(null);
      }
      Alert.alert('Upload failed', 'Unable to queue this photo right now. Please try again.');
    } finally {
      if (isMounted.current) {
        setUploading(false);
      }
    }
  };

  const renderCamera = () => {
    return (
      <ChallengeCameraStage
        promptText={promptText}
        helperText="Snap a photo to upload your challenge entry."
        onPhotoCaptured={setUri}
      />
    );
  };

  const renderPreview = () => (
    <View style={styles.stage}>
      <View style={styles.card}>
        <Image source={{ uri }} style={styles.photo} contentFit="cover" cachePolicy="memory-disk" />
        <View style={[StyleSheet.absoluteFillObject, styles.cardOverlay]} pointerEvents="none" />
        <Pressable style={styles.closeButton} onPress={() => setUri(null)} hitSlop={12}>
          <FontAwesome6 name="xmark" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={handleUpload}
          disabled={uploading}
          style={({ pressed }) => [
            styles.createAction,
            pressed && { opacity: 0.7 },
            uploading && { opacity: 0.5 },
          ]}
        >
          <Text style={styles.createText}>{uploading ? 'UPLOADING...' : 'UPLOAD>'}</Text>
        </Pressable>
      </View>
    </View>
  );

return (
  <View style={styles.container}>
    {renderBackButton()}
    <View
      style={[
        styles.content,
        {
          paddingTop: backButtonClearance,
          paddingBottom: spacing.sm + insets.bottom + EXTRA_BOTTOM_BUFFER,
        },
      ]}
    >
      {uri ? renderPreview() : renderCamera()}
    </View>
  </View>
);
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    permissionGate: {
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.lg,
      gap: spacing.md,
    },
    backButton: {
      position: "absolute",
      left: spacing.md,
      zIndex: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      paddingVertical: spacing.xs,
      paddingRight: spacing.sm,
      paddingLeft: spacing.xs,
    },
    backText: {
      color: colors.text,
      fontSize: fontSizes.sm,
      fontWeight: "800",
      letterSpacing: 0.3,
      textTransform: "uppercase",
    },
    content: {
      flex: 1,
      padding: spacing.sm,
      justifyContent: "center",
      gap: spacing.lg,
    },
    message: { color: colors.text, textAlign: "center" },
    card: {
      width: "100%",
      maxWidth: 520,
      aspectRatio: PHOTO_ASPECT_RATIO,
      borderRadius: radii.lg,
      overflow: "hidden",
      backgroundColor: colors.bg,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 18 },
      shadowRadius: 30,
      shadowOpacity: 0.18,
      elevation: 14,
      borderWidth: 1,
      borderColor: colors.barBorder,
    },
    photo: { ...StyleSheet.absoluteFillObject },
    cardOverlay: { backgroundColor: "rgba(12,7,3,0.1)" },
    closeButton: {
      position: "absolute",
      top: spacing.md,
      right: spacing.md,
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: "rgba(12,7,3,0.48)",
      alignItems: "center",
      justifyContent: "center",
    },
    actions: {
      width: "100%",
      flexDirection: "row",
      marginTop: spacing.sm,
    },
    createAction: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 0,
    },
    createText: {
      fontSize: 26,
      fontWeight: "800",
      letterSpacing: 1.2,
      color: colors.primary,
      fontFamily: "SpaceMono",
    },
  });
}
