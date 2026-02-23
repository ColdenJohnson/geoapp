import { StyleSheet, TextInput, TouchableOpacity, Pressable, View, Text, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AuthContext } from '../hooks/AuthContext';
import { updateUserProfile, setUserHandle, deleteMyAccount } from '@/lib/api';
import { usePalette } from '@/hooks/usePalette';
import { createFormStyles } from '@/components/ui/FormStyles';
import { CTAButton } from '@/components/ui/Buttons';
import { spacing, fontSizes } from '@/theme/tokens';
import emptyPfp from '@/assets/images/empty_pfp.png';
import * as ImagePicker from 'expo-image-picker';
import storage from '@react-native-firebase/storage';

export default function EditProfileScreen() {
  const { user, profile, setProfile, setUser } = useContext(AuthContext);
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formBio, setFormBio] = useState('');
  const [handleInput, setHandleInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [handleStatus, setHandleStatus] = useState(null);
  const router = useRouter();
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const formStyles = useMemo(() => createFormStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    setFormDisplayName(profile?.display_name || '');
    setFormBio(profile?.bio || '');
    setHandleInput(profile?.handle || '');
  }, [profile?.display_name, profile?.bio, profile?.handle]);

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

  const saveChanges = async () => {
    if (!user?.uid) return;
    if (saving) return;
    setSaving(true);
    setHandleStatus(null);

    let updatedProfile = profile;
    let hadError = false;

    const updates = {};
    if (formDisplayName !== (profile?.display_name || '')) updates.display_name = formDisplayName;
    if (formBio !== (profile?.bio || '')) updates.bio = formBio;

    if (Object.keys(updates).length > 0) {
      const updated = await updateUserProfile(user.uid, updates);
      if (updated) {
        updatedProfile = updated;
      } else {
        hadError = true;
        Alert.alert('Profile', 'Failed to save profile updates.');
      }
    }

    let trimmed = handleInput.trim();
    if (trimmed.startsWith('@')) trimmed = trimmed.slice(1);
    if (trimmed && trimmed !== (profile?.handle || '')) {
      const resp = await setUserHandle(trimmed);
      if (resp?.success) {
        updatedProfile = { ...(updatedProfile || profile || {}), handle: resp.handle };
      } else {
        hadError = true;
        setHandleStatus(resp?.error || 'Failed to save handle.');
      }
    }

    if (updatedProfile) {
      setProfile(updatedProfile);
    }

    setSaving(false);
    if (!hadError) {
      router.back();
    }
  };

  const confirmDeleteAccount = () => {
    if (deleting) return;
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
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
            } finally {
              setDeleting(false);
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: spacing['2xl'] + insets.top, paddingBottom: spacing['2xl'] }
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.body}>
          <Text style={styles.pageTitle}>Edit Profile</Text>

          {/* Profile Photo */}
          <View style={[formStyles.card, styles.headerCard]}>
            <TouchableOpacity onPress={pickAndUploadPhoto} disabled={uploading}>
              <View style={styles.profileImageWrap}>
                <Image
                  source={profile?.photo_url ? { uri: profile.photo_url } : emptyPfp}
                  style={styles.profileImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
                {uploading ? (
                  <View style={styles.profileOverlay}>
                    <View style={styles.profileOverlayBackdrop} />
                    <View style={styles.profileOverlayContent}>
                      <ActivityIndicator size="small" color={colors.text} />
                      <Text style={styles.profileOverlayText}>Uploading...</Text>
                    </View>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          </View>

          <View style={[formStyles.card, styles.formCard]}>
            <Text style={styles.sectionTitle}>Display Name</Text>
            <TextInput
              style={formStyles.input}
              placeholder="Enter display name"
              value={formDisplayName}
              onChangeText={setFormDisplayName}
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.primary}
              cursorColor={colors.text}
            />

            <Text style={styles.sectionTitle}>Unique Handle</Text>
            <TextInput
              style={formStyles.input}
              placeholder="your_handle"
              value={handleInput}
              onChangeText={setHandleInput}
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.primary}
              cursorColor={colors.text}
            />
            {handleStatus ? <Text style={styles.statusText}>{handleStatus}</Text> : null}

            <Text style={styles.sectionTitle}>Bio</Text>
            <TextInput
              style={formStyles.input}
              placeholder=""
              value={formBio}
              onChangeText={setFormBio}
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.primary}
              cursorColor={colors.text}
            />
          </View>
        </View>

        <Pressable
          onPress={confirmDeleteAccount}
          style={styles.deletePressable}
          disabled={deleting}
        >
          <Text style={styles.deleteText}>{deleting ? 'Deleting Account...' : 'Delete Account'}</Text>
        </Pressable>
      </ScrollView>
      
      <View style={[styles.footerActions, { paddingBottom: spacing.lg + insets.bottom }]}>
        <View style={styles.footerActionsInner}>
          <View style={styles.actionRow}>
            <CTAButton
              title="Cancel"
              onPress={() => router.back()}
              style={styles.actionButton}
              variant="primary"
            />
            <CTAButton
              title={saving ? 'Saving...' : 'Save'}
              onPress={saveChanges}
              variant="filled"
              style={styles.actionButtonLast}
              disabled={saving}
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
      backgroundColor: colors.surface,
    },
    content: {
      flexGrow: 1,
      paddingHorizontal: spacing.xl,
      width: '100%',
      maxWidth: 520,
      alignSelf: 'center',
    },
    body: {
      flexGrow: 1,
    },
    pageTitle: {
      fontSize: fontSizes.xl,
      fontWeight: '900',
      color: colors.primary,
      marginBottom: spacing.md,
      textAlign: 'center',
      letterSpacing: 0.4,
      fontFamily: 'SpaceMono',
    },
    actionRow: {
      flexDirection: 'row',
    },
    footerActions: {
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.md,
    },
    footerActionsInner: {
      width: '100%',
      maxWidth: 520,
      alignSelf: 'center',
    },
    actionButton: {
      flex: 1,
      marginRight: spacing.sm,
    },
    actionButtonLast: {
      flex: 1,
      marginRight: 0,
    },
    headerCard: {
      alignItems: 'center',
      marginBottom: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: spacing.lg,
    },
    profileImageWrap: {
      width: 120,
      height: 120,
      borderRadius: 36,
      marginBottom: spacing.md,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.primary,
    },
    profileImage: {
      width: 120,
      height: 120,
      borderRadius: 34,
    },
    profileOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    profileOverlayBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.bg,
      opacity: 0.75,
    },
    profileOverlayContent: {
      alignItems: 'center',
      gap: 6,
    },
    profileOverlayText: {
      color: colors.text,
      fontSize: fontSizes.sm,
      fontWeight: '800',
      letterSpacing: 0.6,
    },
    formCard: {
      paddingTop: spacing.lg,
    },
    deletePressable: {
      marginTop: spacing.md,
      alignSelf: 'center',
    },
    deleteText: {
      color: colors.textMuted,
      fontSize: 15,
      fontWeight: '700',
    },
    sectionTitle: {
      fontSize: fontSizes.sm,
      fontWeight: '800',
      letterSpacing: 1.1,
      textTransform: 'uppercase',
      color: colors.text,
      marginBottom: spacing.sm,
      marginTop: spacing.md,
    },
    statusText: {
      color: colors.primary,
      fontWeight: '700',
      marginBottom: spacing.sm,
    },
  });
}
