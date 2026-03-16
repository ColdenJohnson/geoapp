import {
  CameraView,
  useCameraPermissions,
} from "expo-camera";
import { useState, useRef, useMemo, useEffect, useContext } from 'react'
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FontAwesome6, MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
// import storage from '@react-native-firebase/storage';
// import mockImage from '../../assets/images/michael_cornell_sexy.jpeg'; // For Dev
// import { Asset } from 'expo-asset'; // I believe for dev, not sure -- turning mockImage into a uri
import { resolveUpload } from '../lib/promiseStore';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { uploadImage } from '@/lib/uploadHelpers';
import { usePalette } from '@/hooks/usePalette';
import { CTAButton } from '@/components/ui/Buttons';
import { fontSizes, spacing, radii } from '@/theme/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { goBackOrHome, buildViewPhotoChallengeRoute } from '@/lib/navigation';
import { AuthContext } from '@/hooks/AuthContext';
import { updatePinPhotosCache } from '@/lib/pinChallengeCache';

const PHOTO_RATIO = '3:4';
const PHOTO_ASPECT_RATIO = 3 / 4;
const EXTRA_BOTTOM_BUFFER = spacing.md;

export default function Upload({ initialUri = null }) {
  const [facing, setFacing] = useState ("back");
  const [permission, requestPermission] = useCameraPermissions()
  const [uri, setUri] = useState(initialUri);
  const [uploading, setUploading] = useState(false);
  const ref = useRef(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { next, prompt, uploadRequestId, pinId: pinIdParam, created_by_handle: createdByHandleParam } = useLocalSearchParams();
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
  const { profile } = useContext(AuthContext);

  useEffect(() => () => {
    isMounted.current = false;
    if (!didSubmitUpload.current) {
      if (typeof uploadRequestId === 'string' && uploadRequestId) {
        resolveUpload(null, uploadRequestId);
      } else {
        resolveUpload(null);
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

  if (!permission) return <View /> // still loading

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.permissionGate]}>
        {renderBackButton()}
        <Text style={styles.message}>We need your permission to show the camera for SideQuest photo upload to work properly.</Text>
        <CTAButton title="Continue" onPress={requestPermission} />
      </View>
    );
  }

  const toggleFacing = () => {
    setFacing((prev) => (prev === "back" ? "front" : "back"));
  };

  const takePicture = async () => {
    const photo = await ref.current?.takePictureAsync({
      skipProcessing: true,
      ratio: PHOTO_RATIO
    });
    setUri(photo?.uri);
    console.log('Photo captured:', photo?.uri);
  };

  const handleUpload = async () => {
    if (!uri || uploading) return;
    didSubmitUpload.current = true;
    setUploading(true);
    const optimisticPhotoId = `optimistic-${uploadRequestId || Date.now()}`;
    const optimisticPhoto = {
      _id: optimisticPhotoId,
      file_url: uri,
      remote_file_url: null,
      global_elo: 1000,
      global_wins: 0,
      global_losses: 0,
      created_by_handle: typeof profile?.handle === 'string' && profile.handle ? profile.handle : 'you',
      createdAt: new Date().toISOString(),
      optimistic: true,
    };

    if (pinId) {
      try {
        await updatePinPhotosCache(pinId, (current) => {
          const existing = Array.isArray(current) ? current : [];
          return [
            optimisticPhoto,
            ...existing.filter((photo) => String(photo?._id) !== optimisticPhotoId),
          ];
        });
      } catch (error) {
        console.error('Failed to seed optimistic pin photo cache', error);
      }
    }

    (async () => {
      try {
        const downloadURL = await uploadImage(uri);
        if (pinId) {
          await updatePinPhotosCache(pinId, (current) => (
            Array.isArray(current)
              ? current.map((photo) => (
                String(photo?._id) === optimisticPhotoId
                  ? { ...photo, remote_file_url: downloadURL }
                  : photo
              ))
              : current
          ));
        }
        if (typeof uploadRequestId === 'string' && uploadRequestId) {
          resolveUpload(downloadURL, uploadRequestId); // fulfill the original Promise
        } else {
          resolveUpload(downloadURL); // fulfill the original Promise
        }
      } catch (err) {
        console.error('Error uploading image:', err);
        if (pinId) {
          await updatePinPhotosCache(pinId, (current) => (
            Array.isArray(current)
              ? current.filter((photo) => String(photo?._id) !== optimisticPhotoId)
              : current
          ));
        }
        if (typeof uploadRequestId === 'string' && uploadRequestId) {
          resolveUpload(null, uploadRequestId);
        } else {
          resolveUpload(null);
        }
      } finally {
        if (isMounted.current) {
          setUploading(false);
        }
      }
    })();

    if (nextPath === '/view_photochallenge' && pinId) {
      router.push(buildViewPhotoChallengeRoute({
        pinId,
        message: promptText,
        createdByHandle,
      }));
    } else if (nextPath) {
      console.log('Navigating to next:', nextPath);
      router.push(String(nextPath));
    } else {
      console.log('No next specified, going back');
      goBackOrHome(router);
    }
  };

  const renderCamera = () => {
  return (
    <View style={styles.stage}>
      {promptText ? (
        <Text style={styles.promptText} numberOfLines={2}>
          {promptText}
        </Text>
      ) : null}
      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          ref={ref}
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
              <FontAwesome6 name="rotate-left" size={24} color={'#F6EFE8'} />
            </Pressable>
          </View>
        </View>
      </View>
      <Text style={styles.helper}>Snap a photo to upload your challenge entry.</Text>
    </View>
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
    <View style={[styles.content, { paddingBottom: spacing.sm + insets.bottom + EXTRA_BOTTOM_BUFFER }]}>
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
    stage: {
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
    },
    message: { color: colors.text, textAlign: "center" },
    cameraContainer: {
      width: "100%",
      aspectRatio: PHOTO_ASPECT_RATIO,
      overflow: "hidden",
      borderRadius: radii.lg,
      backgroundColor: "black",
      position: "relative",
      shadowColor: "#000000",
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
      justifyContent: "flex-end",
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    helper: {
      color: colors.textMuted,
      textAlign: "center",
      fontWeight: "700",
      marginTop: spacing.sm,
    },
    promptText: {
      width: '100%',
      marginBottom: spacing.sm,
      textAlign: 'center',
      color: colors.primary,
      fontSize: 18,
      fontWeight: '700',
    },
    shutterContainer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%",
    },
    shutterBtn: {
      borderWidth: 3,
      borderColor: colors.primary,
      width: 82,
      height: 82,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg,
      shadowColor: "#000000",
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
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(12,7,3,0.48)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.2)",
    },
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
