import { StyleSheet, Image } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

export default function UserProfileScreen() {
  return (
    <ThemedView style={styles.container}>
      {/* Profile Header */}
      <ThemedView style={styles.header}>
        <Image
          source={{ uri: 'https://via.placeholder.com/150' }}
          style={styles.profileImage}
        />
        <ThemedText type="title">Colden Johnson</ThemedText>
        <ThemedText type="subtitle">user@example.com</ThemedText>
      </ThemedView>

      {/* Profile Details */}
      <ThemedView style={styles.details}>
        <ThemedText type="defaultSemiBold">About Section</ThemedText>
        <ThemedText>
          This is a placeholder for the user's bio or additional information.
        </ThemedText>
      </ThemedView>

      {/* Actions */}
      <ThemedView style={styles.actions}>
        <ThemedText type="link">Edit Profile</ThemedText>
        <ThemedText type="link">Settings</ThemedText>
        <ThemedText type="link">Logout</ThemedText>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
  },
  details: {
    marginBottom: 24,
  },
  actions: {
    marginTop: 16,
  },
});
