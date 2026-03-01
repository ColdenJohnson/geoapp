import { StyleSheet, TextInput, TouchableOpacity, Pressable, View, Text, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AuthContext } from '../hooks/AuthContext';
import { updateUserProfile, setUserHandle, deleteMyAccount } from '@/lib/api';
import { usePalette } from '@/hooks/usePalette';
import { createFormStyles } from '@/components/ui/FormStyles';
import { CTAButton } from '@/components/ui/Buttons';
import { PreferenceToggleRow } from '@/components/ui/PreferenceToggleRow';
import { spacing, fontSizes } from '@/theme/tokens';
import emptyPfp from '@/assets/images/empty_pfp.png';
import * as ImagePicker from 'expo-image-picker';
import storage from '@react-native-firebase/storage';

const BIO_MAX_LENGTH = 100;

export default function EditProfileScreen() {
  const { user, profile, setProfile, setUser } = useContext(AuthContext);
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formBio, setFormBio] = useState('');
  const [handleInput, setHandleInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [handleStatus, setHandleStatus] = useState(null);
  const defaultPrivacySyncInFlightRef = useRef(false);
  const desiredDefaultPrivateRef = useRef(null);
  const acknowledgedDefaultPrivateRef = useRef(null);
  const router = useRouter();
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const formStyles = useMemo(() => createFormStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const isDefaultPinPrivate = profile?.default_pin_private === true;

  useEffect(() => {
    setFormDisplayName(profile?.display_name || '');
    setFormBio((profile?.bio || '').slice(0, BIO_MAX_LENGTH));
    setHandleInput(profile?.handle || '');
  }, [profile?.display_name, profile?.bio, profile?.handle]);

  useEffect(() => {
    const value = profile?.default_pin_private === true;
    acknowledgedDefaultPrivateRef.current = value;
    desiredDefaultPrivateRef.current = value;
  }, [profile?.default_pin_private]);

  const flushDefaultPrivacyUpdates = useCallback(async () => {
    if (!user?.uid || defaultPrivacySyncInFlightRef.current) return;
    defaultPrivacySyncInFlightRef.current = true;
    try {
      while (
        typeof desiredDefaultPrivateRef.current === 'boolean' &&
        desiredDefaultPrivateRef.current !== acknowledgedDefaultPrivateRef.current
      ) {
        const target = desiredDefaultPrivateRef.current;
        const updated = await updateUserProfile(user.uid, { default_pin_private: target });
        if (!updated || typeof updated?.default_pin_private !== 'boolean') {
          const fallback = typeof acknowledgedDefaultPrivateRef.current === 'boolean'
            ? acknowledgedDefaultPrivateRef.current
            : false;
          desiredDefaultPrivateRef.current = fallback;
          setProfile((prev) => ({ ...(prev || {}), default_pin_private: fallback }));
          break;
        }
        const persisted = updated.default_pin_private === true;
        acknowledgedDefaultPrivateRef.current = persisted;
        setProfile(updated);
      }
    } finally {
      defaultPrivacySyncInFlightRef.current = false;
      if (
        typeof desiredDefaultPrivateRef.current === 'boolean' &&
        desiredDefaultPrivateRef.current !== acknowledgedDefaultPrivateRef.current
      ) {
        flushDefaultPrivacyUpdates();
      }
    }
  }, [setProfile, user?.uid]);

  const onToggleDefaultPinPrivacy = useCallback((nextValue) => {
    if (!user?.uid) return;
    const optimisticValue = !!nextValue;
    desiredDefaultPrivateRef.current = optimisticValue;
    setProfile((prev) => ({ ...(prev || {}), default_pin_private: optimisticValue }));
    flushDefaultPrivacyUpdates();
  }, [flushDefaultPrivacyUpdates, setProfile, user?.uid]);

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
    const normalizedBio = typeof formBio === 'string' ? formBio.slice(0, BIO_MAX_LENGTH) : '';
    if (normalizedBio !== (profile?.bio || '')) updates.bio = normalizedBio;

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
            <TouchableOpacity onPress={pickAndUploadPhoto} disabled={uploading} style={styles.profileImageWrap}>
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
              onChangeText={(value) => setFormBio(value.slice(0, BIO_MAX_LENGTH))}
              maxLength={BIO_MAX_LENGTH}
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.primary}
              cursorColor={colors.text}
            />
            <Text style={styles.bioCounter}>{`${formBio.length}/${BIO_MAX_LENGTH}`}</Text>
          </View>

          <View style={[formStyles.card, styles.preferenceCard]}>
            <Text style={styles.sectionTitle}>Upload Defaults</Text>
            <PreferenceToggleRow
              label="New pins private by default"
              description="When enabled, new pins you create are friends-only unless you change privacy on that pin later."
              value={isDefaultPinPrivate}
              onValueChange={onToggleDefaultPinPrivacy}
              disabled={!user?.uid}
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
      width: 108,
      height: 108,
      borderRadius: 54,
      marginBottom: spacing.md,
      overflow: 'hidden',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 16,
      shadowOpacity: 0.12,
      elevation: 6,
    },
    profileImage: {
      width: '100%',
      height: '100%',
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
    preferenceCard: {
      marginTop: spacing.sm,
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
    bioCounter: {
      marginTop: spacing.xs,
      textAlign: 'right',
      color: colors.textMuted,
      fontSize: fontSizes.sm,
      fontWeight: '700',
    },
  });
}
