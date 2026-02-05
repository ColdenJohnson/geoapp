import {
  CameraView,
  useCameraPermissions,
} from "expo-camera";
import { useState, useRef, useMemo, useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { Image } from "expo-image";
// import storage from '@react-native-firebase/storage';
// import mockImage from '../../assets/images/michael_cornell_sexy.jpeg'; // For Dev
// import { Asset } from 'expo-asset'; // I believe for dev, not sure -- turning mockImage into a uri
import { resolveUpload } from '../lib/promiseStore';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { uploadImage } from '@/lib/uploadHelpers';
import { usePalette } from '@/hooks/usePalette';
import { CTAButton } from '@/components/ui/Buttons';

export default function Upload({ initialUri = null }) {
  const [facing, setFacing] = useState ("back");
  const [permission, requestPermission] = useCameraPermissions()
  const [uri, setUri] = useState(initialUri);
  const [mode, setMode] = useState("picture");
  const [uploading, setUploading] = useState(false);
  const ref = useRef(null);
  const router = useRouter();
  const { next } = useLocalSearchParams();
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isMounted = useRef(true);

  useEffect(() => () => {
    isMounted.current = false;
  }, []);


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
      <View style={styles.container}>
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
      ratio: "4:3"
    });
    setUri(photo?.uri);
    console.log('Photo captured:', photo?.uri);

  };

  const renderPicture = () => {
    return (
      <View>
        <Image
          source={{ uri }}
          contentFit="contain"
          style={{ width: '100%', aspectRatio: 3/4 }}
        />
        <View style={styles.actionRow}>
          <CTAButton style={[styles.actionButton, { marginRight: 12 }]} onPress={() => setUri(null)} title="Retake Picture" />
          <CTAButton
            style={styles.actionButton}
            variant="filled"
            onPress={async () => {
              if (!uri || uploading) return;
              setUploading(true);
              (async () => {
                try {
                  const downloadURL = await uploadImage(uri);
                  resolveUpload(downloadURL); // fulfill the original Promise
                } catch (err) {
                  console.error('Error uploading image:', err);
                  resolveUpload(null);
                } finally {
                  if (isMounted.current) {
                    setUploading(false);
                  }
                }
              })();

              if (next) {
                console.log('Navigating to next:', next);
                router.push(String(next));
              } else {
                console.log('No next specified, going back');
                router.back();
              }
            }}
            title="Upload"
            disabled={uploading}
          />
        </View>
      </View>
    );
  };

  const renderCamera = () => {
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          ref={ref}
          facing={facing}
          mute={false}
          responsiveOrientationWhenOrientationLocked
          ratio="4:3"
        />
      </View>
      <View style={styles.shutterContainer}>
        {/* Empty view to maintain space, could add a button here instead. */}
        <View style={{ width: 32 }} />

        <Pressable onPress={takePicture}>
          {({ pressed }) => (
            <View
              style={[
                styles.shutterBtn,
                {
                  opacity: pressed ? 0.5 : 1,
                },
              ]}
            >
              <View
                style={styles.shutterBtnInner}
              />
            </View>
          )}
        </Pressable>
        <Pressable onPress={toggleFacing}>
          <FontAwesome6 name="rotate-left" size={32} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
};

return (
  <View style={styles.container}>
    {uri ? renderPicture() : renderCamera()}
  </View>
);
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
    },
    message: { color: colors.text, textAlign: 'center', marginBottom: 12 },
    cameraContainer: {
      width: "100%",
      aspectRatio: 3 / 4,
      overflow: "hidden", // clip anything outside 4:3
      backgroundColor: "black", // optional, prevents weird edges
    },
    camera: {
      flex: 1,
    },
    actionRow: {
      flexDirection: 'row',
      width: '100%',
      marginTop: 12,
    },
    actionButton: { flex: 1 },
    shutterContainer: {
      position: "absolute",
      bottom: 90,
      left: 0,
      width: "100%",
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 30,
    },
    shutterBtn: {
      backgroundColor: "transparent",
      borderWidth: 5,
      borderColor: colors.text,
      width: 85,
      height: 85,
      borderRadius: 45,
      alignItems: "center",
      justifyContent: "center",
    },
    shutterBtnInner: {
      width: 70,
      height: 70,
      borderRadius: 50,
      backgroundColor: colors.bg,
    },
  });
}
