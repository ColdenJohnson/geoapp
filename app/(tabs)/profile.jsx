import { StyleSheet, Image, TextInput, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

import { useFirebaseImage } from '@/hooks/useFirebaseImage';
import { ImgDisplay } from '@/components/ImgDisplay';

import { Button } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage'
import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../hooks/AuthContext';

import { updateUserProfile } from '@/lib/api';

import emptyPfp from '@/assets/images/empty_pfp.png';
import * as ImagePicker from 'expo-image-picker';
import storage from '@react-native-firebase/storage';

export default function UserProfileScreen() {
  const { user, setUser, profile, setProfile } = useContext(AuthContext);
  const [editing, setEditing] = useState(false);
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formBio, setFormBio] = useState('');
  const [uploading, setUploading] = useState(false);

  const beginEdit = () => {
    if (!profile) return;
    setFormDisplayName(profile.display_name || '');
    setFormBio(profile.bio || '');
    setEditing(true);
  };

  const saveEdits = async () => {
    if (!user?.uid) return;
    const updates = { display_name: formDisplayName, bio: formBio };
    const updated = await updateUserProfile(user.uid, updates); // Actually save updates to backend
    if (updated) {
      setProfile(updated);
      setEditing(false);
    }
  };

  async function uploadImageToStorage(uri) {
    // Minimal: no compression here; reuse your existing pattern from Upload tab
    const resp = await fetch(uri);
    const blob = await resp.blob();
    const safeName = uri.split('/').pop() || 'photo.jpg';
    const fileName = `profile_${user?.uid || 'anon'}_${Date.now()}_${safeName}`;
    const ref = storage().ref(`profile_photos/${fileName}`);
    await ref.put(blob);
    const downloadURL = await ref.getDownloadURL();
    return downloadURL;
  }

  const pickAndUploadPhoto = async () => {
    try {
      if (!user?.uid) return;
      // Ask for permission
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        console.warn('Media library permission not granted');
        return;
      }
      // Launch picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) return;
      setUploading(true);

      const url = await uploadImageToStorage(asset.uri);

      // Persist to your profile
      const updated = await updateUserProfile(user.uid, { photo_url: url });
      if (updated) setProfile(updated);
    } catch (e) {
      console.error('Profile photo upload failed:', e);
    } finally {
      setUploading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* Profile Header -- could have a different profile picture */}
      <ThemedView style={styles.header}>
      <TouchableOpacity onPress={pickAndUploadPhoto} disabled={uploading}>
        <Image
          source={profile?.photo_url ? { uri: profile.photo_url } : emptyPfp}
          style={styles.profileImage}
        />
      </TouchableOpacity>
      {editing ? (
        <TextInput
          style={styles.input}
          placeholder={profile?.display_name || "Enter display name"}
          value={formDisplayName}
          onChangeText={setFormDisplayName}
        />
      ) : (
        <ThemedText type="title">{profile?.display_name || 'No Display Name set'}</ThemedText>
      )}
      <ThemedText type="subtitle">{profile?.email || "noemail"}</ThemedText> 
      </ThemedView>

      {/* Profile Details */}
      <ThemedView style={styles.details}>
        <ThemedText type="defaultSemiBold">About Me</ThemedText>
        {editing ? (
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Bio"
            value={formBio}
            onChangeText={setFormBio}
            multiline
            numberOfLines={4}
          />
        ) : (
          <ThemedText>
            {profile?.bio || 'No bio set.'}
          </ThemedText>
        )}
      </ThemedView>

      {/* Actions */}
      <ThemedView style={styles.actions}>
        {editing ? (
          <>
            <ThemedText type="link" onPress={saveEdits}>Save</ThemedText>
            <ThemedText type="link" onPress={() => setEditing(false)}>Cancel</ThemedText>
          </>
        ) : (
          <ThemedText type="link" onPress={beginEdit}>Edit Settings</ThemedText>
        )}

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
    padding: 5,
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
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignSelf: 'stretch',
    marginTop: 8,
  },
  multiline: {
    textAlignVertical: 'top',
    minHeight: 100,
  },
});
