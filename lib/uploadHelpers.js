import * as ImageManipulator from 'expo-image-manipulator';
import storage from '@react-native-firebase/storage';

const DEFAULT_WIDTH = 1024;
const DEFAULT_COMPRESS = 0.5;

export async function compressImage(uri, options = {}) {
  const { width = DEFAULT_WIDTH, compress = DEFAULT_COMPRESS } = options;
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width } }],
    { compress, format: ImageManipulator.SaveFormat.JPEG }
  );
  return result.uri;
}

export async function uploadImage(uri) {
  const compressedUri = await compressImage(uri);
  const response = await fetch(compressedUri);
  const blob = await response.blob();

  const fileName = `${Date.now()}_${uri.split('/').pop()}`;
  const ref = storage().ref(`images/${fileName}`);
  await ref.put(blob);

  return ref.getDownloadURL();
}
