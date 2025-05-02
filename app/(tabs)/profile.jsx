import { StyleSheet, Image } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

import { useFirebaseImage } from '@/hooks/useFirebaseImage';
import { ImgDisplay } from '@/components/ImgDisplay';

import { Button } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage'
import { useContext } from 'react';
import { AuthContext } from '../../hooks/AuthContext';


export default function UserProfileScreen() {
  const { setUser } = useContext(AuthContext);
  return (
    <ThemedView style={styles.container}>
      {/* Profile Header -- could have a different profile picture */}
      <ThemedView style={styles.header}>
      <ImgDisplay filename="michael_cornell_sexy.jpeg" style={styles.profileImage} /> 
        <ThemedText type="title">Colden Johnson</ThemedText>
        <ThemedText type="subtitle">user@example.com</ThemedText>
      </ThemedView>

      {/* Profile Details */}
      <ThemedView style={styles.details}>
        <ThemedText type="defaultSemiBold">About Me</ThemedText>
        <ThemedText>
          This is a placeholder for the user's bio or additional information.
        </ThemedText>
      </ThemedView>

      {/* Actions */}
      <ThemedView style={styles.actions}>
        <ThemedText type="link">Edit Profile</ThemedText>
        <ThemedText type="link">Settings</ThemedText>

        {/* Sign Out button, theoretically. */}
      <Button
        title="Sign Out"
        onPress={async () => {
          try {
            await AsyncStorage.removeItem('user_token');
            setUser(null); // clear user state, automatically rerun RootLayout

            console.log('User signed out');
          } catch (error) {
            console.error('Sign out failed:', error);
          }
        }}
      />
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
