import * as ImageManipulator from 'expo-image-manipulator';
import storage from '@react-native-firebase/storage';

const DEFAULT_WIDTH = 1024;
const DEFAULT_COMPRESS = 0.5;

function sanitizeStorageSegment(value, fallback = 'upload') {
  const input = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  return input.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function extractFileExtension(uri) {
  const match = typeof uri === 'string' ? uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/) : null;
  return match?.[1] ? `.${match[1].toLowerCase()}` : '.jpg';
}

export async function compressImage(uri, options = {}) {
  const { width = DEFAULT_WIDTH, compress = DEFAULT_COMPRESS } = options;
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width } }],
    { compress, format: ImageManipulator.SaveFormat.JPEG }
  );
  return result.uri;
}

export async function uploadImage(uri, options = {}) {
  const compressedUri = await compressImage(uri);
  const response = await fetch(compressedUri);
  const blob = await response.blob();

  const uploadKey = typeof options?.uploadKey === 'string' ? options.uploadKey.trim() : '';
  const fileName = uploadKey
    ? `${sanitizeStorageSegment(uploadKey)}${extractFileExtension(uri)}`
    : `${Date.now()}_${sanitizeStorageSegment(uri.split('/').pop(), `photo${extractFileExtension(uri)}`)}`;
  const ref = storage().ref(`images/${fileName}`);
  await ref.put(blob);

  return ref.getDownloadURL();
}
