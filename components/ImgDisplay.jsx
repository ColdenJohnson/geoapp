import { Image } from 'react-native';
import { useFirebaseImage } from '@/hooks/useFirebaseImage';
import { ActivityIndicator, View } from 'react-native';

export function ImgFromUrl({ url, style, resizeMode = "contain" }) {
  if (!url) {
    return null;
  }

  return (
    <Image
      source={{ uri: url }}
      style={style}
      resizeMode={resizeMode}
    />
  );
}

// Proper Component
export function ImgDisplay({ filename, style, resizeMode = "contain" }) {
  const imageUrl = useFirebaseImage(filename);


  if (!imageUrl) {
    return (
      <View style={[{ width: 200, height: 200, justifyContent: 'center', alignItems: 'center' }, style]}>
        <ActivityIndicator size="medium" />
      </View>
    );
  }


  return (
    <Image
      source={{ uri: imageUrl }}
      style={style}
      resizeMode="contain"
    />
  );
}
