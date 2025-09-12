import { StyleSheet, Image } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

import { useFirebaseImage } from '@/hooks/useFirebaseImage';
import { ImgDisplay } from '@/components/ImgDisplay';

import { Button } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage'
import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../hooks/AuthContext';

import { fetchUsersByUID, updateUserProfile } from '@/lib/api';


export default function UserProfileScreen() {
  const { user, setUser } = useContext(AuthContext);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      if (user) {
        const userProfile = await fetchUsersByUID(user.uid);
        setProfile(userProfile);
        setLoading(false);
      }
    };
    fetchProfile();
  }, [user]);

  return (
    <ThemedView style={styles.container}>
      {/* Profile Header -- could have a different profile picture */}
      <ThemedView style={styles.header}>
      {/* This line allows for a profile photo -- need to put this back in. */}
      {/* <ImgDisplay filename="michael_cornell_sexy.jpeg" style={styles.profileImage} />  */} 
        <ThemedText type="title">{profile?.display_name || "No Display Name set"}</ThemedText>
        <ThemedText type="subtitle">{profile?.email || "noemail"}</ThemedText> 
      </ThemedView>

      {/* Profile Details */}
      <ThemedView style={styles.details}>
        <ThemedText type="defaultSemiBold">About Me</ThemedText>
        <ThemedText>
          {profile?.bio || "No bio set."}
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
