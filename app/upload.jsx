import {
  CameraMode,
  CameraType,
  CameraView,
  useCameraPermissions,
} from "expo-camera";
import { useState, useRef, useEffect } from 'react'
import { Button, Pressable, StyleSheet, Text, View, Platform } from "react-native";
import { AntDesign } from "@expo/vector-icons";
import { Feather } from "@expo/vector-icons";
import { FontAwesome6 } from "@expo/vector-icons";
import { Image } from "expo-image";
import DeviceInfo from 'react-native-device-info';
// import storage from '@react-native-firebase/storage';
// import mockImage from '../../assets/images/michael_cornell_sexy.jpeg'; // For Dev
// import { Asset } from 'expo-asset'; // I believe for dev, not sure -- turning mockImage into a uri
import { resolveUpload } from '../lib/promiseStore';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { uploadImage } from '@/lib/uploadHelpers';

export default function Upload({ initialUri = null }) {
  const [facing, setFacing] = useState ("back");
  const [permission, requestPermission] = useCameraPermissions()
  const [uri, setUri] = useState(initialUri);
  const [mode, setMode] = useState("picture");
  const ref = useRef(null);
  const router = useRouter();
  const { next } = useLocalSearchParams();


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
        <Text style={styles.message}>We need your permission to show the camera for Geode photo upload to work properly.</Text>
        <Button title="Continue" onPress={requestPermission} />
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
        <Button onPress={() => setUri(null)} title="Take another picture" />
        <Button 
  onPress={async () => {
    try {
      const downloadURL = await uploadImage(uri); 
      resolveUpload(downloadURL); // fulfill the original Promise
      if (next) {
        console.log('Navigating to next:', next);
        router.push(String(next));
      } else {
        console.log('No next specified, going back');
        router.back();
      }
    } catch (err) {
      console.error('Error uploading image:', err);
    }
    // TODO: make this loading screen not slow
  }}
  title="Upload picture"
/>
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
                style={[
                  styles.shutterBtnInner,
                  {
                    backgroundColor: "black",
                  },
                ]}
              />
            </View>
          )}
        </Pressable>
        <Pressable onPress={toggleFacing}>
          <FontAwesome6 name="rotate-left" size={32} color="black" />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraContainer: {
    width: "100%",
    aspectRatio: 3 / 4,
    overflow: "hidden", // clip anything outside 4:3
    backgroundColor: "black", // optional, prevents weird edges
  },
  camera: {
    flex: 1,
  },
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
    borderColor: "black",
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
  },
});
