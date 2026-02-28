import { Modal, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';

export function FullscreenImageViewer({ visible, imageUrl, onClose }) {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Image
          source={imageUrl ? { uri: imageUrl } : undefined}
          style={styles.image}
          contentFit="contain"
          cachePolicy="memory-disk"
        />
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
