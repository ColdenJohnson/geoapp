import { StyleSheet, Image, TextInput, TouchableOpacity, View, Text, Alert } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useContext, useMemo, useState } from 'react';
import { AuthContext } from '../../hooks/AuthContext';
import { useFocusEffect } from '@react-navigation/native';

import { updateUserProfile, deleteMyAccount, fetchUserStats } from '@/lib/api';

import emptyPfp from '@/assets/images/empty_pfp.png';
import * as ImagePicker from 'expo-image-picker';
import storage from '@react-native-firebase/storage';
import auth from '@react-native-firebase/auth';
import { usePalette } from '@/hooks/usePalette';
import { CTAButton, SecondaryButton } from '@/components/ui/Buttons';
import { createFormStyles } from '@/components/ui/FormStyles';
import { spacing, fontSizes } from '@/theme/tokens';

export default function UserProfileScreen() {
  const { user, setUser, profile, setProfile } = useContext(AuthContext);
  const [editing, setEditing] = useState(false);
  const [formDisplayName, setFormDisplayName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [stats, setStats] = useState(null);
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const formStyles = useMemo(() => createFormStyles(colors), [colors]);
  const authUser = auth().currentUser;
  const contactValue =
    user?.email ||
    authUser?.phoneNumber ||
    profile?.email ||
    profile?.phone_number ||
    'No contact info on file';

  const beginEdit = () => {
    setFormDisplayName(profile?.display_name || '');
    setEditing(true);
  };

  const loadStats = useCallback(() => {
    let isActive = true;
    async function run() {
      if (!user?.uid) {
        setStats(null);
        return;
      }
      const data = await fetchUserStats(user.uid);
      if (isActive) setStats(data);
    }
    run();
    return () => {
      isActive = false;
    };
  }, [user?.uid]);

  useFocusEffect(loadStats);

  const saveEdits = async () => {
    if (!user?.uid) return;
    const updates = { display_name: formDisplayName };
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
    <View style={styles.container}>
      <View style={styles.heroGlow} />
      <View style={styles.content}>
        {/* Profile Header -- could have a different profile picture */}
        <View style={[formStyles.card, styles.headerCard]}>
          <TouchableOpacity onPress={pickAndUploadPhoto} disabled={uploading}>
            <Image
              source={profile?.photo_url ? { uri: profile.photo_url } : emptyPfp}
              style={styles.profileImage}
            />
          </TouchableOpacity>
          {editing ? (
            <TextInput
              style={[formStyles.input, styles.nameInput]}
              placeholder={profile?.display_name || "Enter display name"}
              value={formDisplayName}
              onChangeText={setFormDisplayName}
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.primary}
              cursorColor={colors.text}
            />
          ) : (
            <Text style={styles.displayName}>{profile?.display_name || 'No Display Name set'}</Text>
          )}
          <Text style={styles.contactText}>{contactValue}</Text>
        </View>

        {/* Profile Details */}
        <View style={[formStyles.card, styles.statsCard]}>
          <Text style={styles.sectionTitle}>Stats</Text>
          <Text style={styles.statsText}>Pins posted: {stats?.pin_count ?? profile?.pin_count ?? 0}</Text>
          <Text style={styles.statsText}>Photos posted: {stats?.photo_count ?? profile?.photo_count ?? 0}</Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {editing ? (
            <>
              <View style={styles.actionRow}>
                <CTAButton
                  title="Save"
                  onPress={saveEdits}
                  variant="filled"
                  style={styles.actionButton}
                />
                <SecondaryButton
                  title="Cancel"
                  onPress={() => setEditing(false)}
                  style={styles.actionButtonLast}
                />
              </View>
            </>
          ) : (
            <CTAButton
              title="Edit Profile"
              onPress={beginEdit}
              variant="secondary"
            />
          )}

          {/* Sign Out button, theoretically. */}
          <View style={styles.actionRow}>
          <SecondaryButton
            title="Sign Out"
            onPress={async () => {
              try {
                await auth().signOut();
                await AsyncStorage.removeItem('user_token');
                setUser(null); // clear user state, automatically rerun RootLayout

                console.log('User signed out');
              } catch (error) {
                  console.error('Sign out failed:', error);
                }
              }}
              style={styles.actionButton}
            />
            <CTAButton
              title="Delete Account"
              variant="secondary"
              style={[styles.actionButtonLast, styles.dangerButton]}
              textStyle={styles.dangerText}
              onPress={() => {
                Alert.alert(
                  'Delete Account',
                  'This will permanently delete your account. This cannot be undone.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: async () => {
                        try {
                          const resp = await deleteMyAccount();
                          if (resp?.success) {
                            await AsyncStorage.removeItem('user_token');
                            setUser(null);
                            console.log('Account deleted');
                          } else {
                            console.error('Delete failed:', resp?.error || 'Unknown');
                          }
                        } catch (e) {
                          console.error('Delete account error:', e);
                        }
                      } }
                  ]
                );
              }}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    heroGlow: {
      position: 'absolute',
      top: -140,
      right: -100,
      width: 260,
      height: 260,
      borderRadius: 130,
      backgroundColor: colors.primary,
      opacity: 0.07,
    },
    content: {
      flex: 1,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing['2xl'],
      paddingBottom: spacing['2xl'],
      width: '100%',
      maxWidth: 520,
      alignSelf: 'center',
    },
    headerCard: {
      alignItems: 'center',
      marginBottom: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: spacing.lg,
    },
    profileImage: {
      width: 96,
      height: 96,
      borderRadius: 48,
      marginBottom: spacing.md,
    },
    nameInput: {
      alignSelf: 'stretch',
      textAlign: 'center',
    },
    displayName: {
      fontSize: fontSizes.xl,
      fontWeight: '700',
      color: colors.text,
      fontFamily: 'SpaceMono',
      textAlign: 'center',
    },
    contactText: {
      color: colors.textMuted,
      marginTop: spacing.xs,
      textAlign: 'center',
    },
    statsCard: {
      marginBottom: spacing.lg,
    },
    sectionTitle: {
      fontSize: fontSizes.lg,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.sm,
    },
    statsText: {
      color: colors.textMuted,
      lineHeight: 22,
    },
    actions: {
      marginTop: spacing.md,
    },
    actionRow: {
      flexDirection: 'row',
      marginTop: spacing.md,
    },
    actionButton: {
      flex: 1,
      marginRight: spacing.sm,
    },
    actionButtonLast: {
      flex: 1,
      marginRight: 0,
    },
    dangerButton: {
      borderColor: colors.danger,
    },
    dangerText: {
      color: colors.danger,
    },
  });
}
