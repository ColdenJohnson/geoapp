import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { CTAButton } from '@/components/ui/Buttons';
import BottomBar from '@/components/ui/BottomBar';
import { createFormStyles } from '@/components/ui/FormStyles';
import { AuthContext } from '@/hooks/AuthContext';
import { usePalette } from '@/hooks/usePalette';
import { searchUserByHandle, setUserHandle, updateUserProfile } from '@/lib/api';
import {
  findExactHandleMatch,
  getHandleValidationMessage,
  normalizeHandleInput,
} from '@/lib/handleValidation';
import { radii, spacing } from '@/theme/tokens';
import { textStyles } from '@/theme/typography';

const HANDLE_CHECK_DEBOUNCE_MS = 250;

export default function CreateUsernameScreen() {
  const { user, setUser, setProfile } = useContext(AuthContext);
  const [handleInput, setHandleInput] = useState('');
  const [availabilityState, setAvailabilityState] = useState('idle');
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const availabilityRequestIdRef = useRef(0);

  const colors = usePalette();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const formStyles = useMemo(() => createFormStyles(colors), [colors]);

  const normalizedHandle = useMemo(() => normalizeHandleInput(handleInput), [handleInput]);
  const validationMessage = useMemo(() => getHandleValidationMessage(handleInput), [handleInput]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const handleKeyboardShow = (event) => {
      setKeyboardHeight(event?.endCoordinates?.height ?? 0);
    };

    const handleKeyboardHide = () => {
      setKeyboardHeight(0);
    };

    const showSubscription = Keyboard.addListener(showEvent, handleKeyboardShow);
    const hideSubscription = Keyboard.addListener(hideEvent, handleKeyboardHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    setSaveError('');
  }, [handleInput]);

  useEffect(() => {
    if (!normalizedHandle) {
      setAvailabilityState('idle');
      return undefined;
    }

    if (validationMessage) {
      setAvailabilityState('invalid');
      return undefined;
    }

    const requestId = availabilityRequestIdRef.current + 1;
    availabilityRequestIdRef.current = requestId;
    setAvailabilityState('checking');

    const timer = globalThis.setTimeout(async () => {
      const results = await searchUserByHandle(normalizedHandle);
      if (availabilityRequestIdRef.current !== requestId) {
        return;
      }

      const exactMatch = findExactHandleMatch(results, normalizedHandle);
      if (exactMatch && exactMatch.uid !== user?.uid) {
        setAvailabilityState('taken');
        return;
      }

      setAvailabilityState('available');
    }, HANDLE_CHECK_DEBOUNCE_MS);

    return () => globalThis.clearTimeout(timer);
  }, [normalizedHandle, user?.uid, validationMessage]);

  const handleGoBack = useCallback(async () => {
    if (isSigningOut) {
      return;
    }

    try {
      setIsSigningOut(true);
      setSaveError('');
      await auth().signOut();
      await AsyncStorage.removeItem('user_token');
      setUser(null);
    } catch (error) {
      console.error('Sign out failed from username gate:', error);
      setSaveError('Unable to go back right now. Please try again.');
    } finally {
      setIsSigningOut(false);
    }
  }, [isSigningOut, setUser]);

  const handleContinue = useCallback(async () => {
    if (!user?.uid || !normalizedHandle || validationMessage || availabilityState !== 'available' || isSaving) {
      return;
    }

    try {
      setIsSaving(true);
      setSaveError('');

      const handleResponse = await setUserHandle(normalizedHandle);
      if (!handleResponse?.success) {
        if (typeof handleResponse?.error === 'string' && handleResponse.error.toLowerCase().includes('taken')) {
          setAvailabilityState('taken');
          return;
        }
        setSaveError(handleResponse?.error || 'Unable to save that handle right now.');
        return;
      }

      const updatedProfile = await updateUserProfile(user.uid, { display_name: normalizedHandle });
      if (!updatedProfile) {
        setSaveError('We saved your handle, but could not finish setup. Please try again.');
        return;
      }

      setProfile(updatedProfile);
    } catch (error) {
      console.error('Failed to complete username setup:', error);
      setSaveError('Unable to save that handle right now.');
    } finally {
      setIsSaving(false);
    }
  }, [availabilityState, isSaving, normalizedHandle, setProfile, user?.uid, validationMessage]);

  const keyboardOffset = Platform.OS === 'ios'
    ? Math.max(keyboardHeight - insets.bottom, 0)
    : keyboardHeight;
  const actionBarBottom = keyboardOffset > 0 ? keyboardOffset + spacing.sm : spacing.lg;
  const isContinueDisabled = !normalizedHandle
    || !!validationMessage
    || availabilityState !== 'available'
    || isSaving
    || isSigningOut;

  const statusConfig = useMemo(() => {
    if (saveError) {
      return { text: saveError, style: styles.statusTextError };
    }
    if (validationMessage) {
      return { text: validationMessage, style: styles.statusTextError };
    }
    if (availabilityState === 'checking') {
      return { text: 'Checking availability...', style: styles.statusTextMuted };
    }
    if (availabilityState === 'taken') {
      return { text: 'That handle is already taken.', style: styles.statusTextError };
    }
    if (availabilityState === 'available') {
      return { text: 'Handle available.', style: styles.statusTextSuccess };
    }
    return { text: '3-20 letters, numbers, or underscores.', style: styles.statusTextMuted };
  }, [availabilityState, saveError, styles.statusTextError, styles.statusTextMuted, styles.statusTextSuccess, validationMessage]);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <SafeAreaView style={styles.container}>
        <View style={styles.screen}>
          <View style={styles.header}>
            <View style={styles.headerSide}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go back"
                onPress={handleGoBack}
                style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
              >
                <FontAwesome name="arrow-left" size={16} color="#FFFFFF" />
              </Pressable>
            </View>
            <Text style={styles.brand}>SideQuest</Text>
            <View style={styles.headerSide}>
              <View style={styles.backButtonPlaceholder} />
            </View>
          </View>

          <View style={styles.content}>
            <View style={[styles.section, styles.usernameSection]}>
              <Text style={styles.title}>Create a username</Text>
              <Text style={styles.subtitle}>This will be your unique handle ID.</Text>

              <TextInput
                testID="create-username-input"
                style={[
                  formStyles.input,
                  (validationMessage || availabilityState === 'taken') ? styles.invalidInput : null,
                  availabilityState === 'available' ? styles.validInput : null,
                ]}
                placeholder="your_handle"
                value={handleInput}
                onChangeText={setHandleInput}
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor={colors.textMuted}
                selectionColor={colors.primary}
                cursorColor={colors.text}
              />
              <Text style={[styles.statusTextBase, statusConfig.style]}>
                {statusConfig.text}
              </Text>
            </View>
          </View>

          <BottomBar style={[styles.actionBar, { bottom: actionBarBottom }]}>
            <View style={styles.actionInner}>
              <CTAButton
                title="Continue"
                onPress={handleContinue}
                variant="filled"
                style={styles.primaryButton}
                disabled={isContinueDisabled}
                loading={isSaving}
              />
            </View>
          </BottomBar>
        </View>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    screen: {
      flex: 1,
      position: 'relative',
    },
    header: {
      height: 72,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
    },
    headerSide: {
      width: 42,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    backButtonPlaceholder: {
      width: 42,
      height: 42,
    },
    backButton: {
      width: 42,
      height: 42,
      borderRadius: radii.round,
      backgroundColor: 'rgba(26, 26, 26, 0.88)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    backButtonPressed: {
      opacity: 0.92,
      transform: [{ scale: 0.97 }],
    },
    brand: {
      ...textStyles.brand,
      color: colors.primary,
      flex: 1,
      textAlign: 'center',
    },
    content: {
      flex: 1,
      width: '100%',
      maxWidth: 420,
      alignSelf: 'center',
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.lg,
      paddingBottom: 132,
      justifyContent: 'flex-start',
    },
    section: {
      width: '100%',
    },
    usernameSection: {
      marginTop: spacing['2xl'],
    },
    title: {
      ...textStyles.pageTitleCompact,
      color: colors.text,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    subtitle: {
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: spacing.xl,
    },
    invalidInput: {
      borderColor: colors.danger,
    },
    validInput: {
      borderColor: colors.success,
    },
    statusTextBase: {
      ...textStyles.body2xsBold,
      marginTop: spacing.sm,
      textAlign: 'center',
      letterSpacing: 0.2,
    },
    statusTextMuted: {
      color: colors.textMuted,
    },
    statusTextError: {
      color: colors.danger,
    },
    statusTextSuccess: {
      color: colors.success,
    },
    actionBar: {
      position: 'absolute',
      left: spacing.lg,
      right: spacing.lg,
      borderRadius: radii.lg,
      borderTopWidth: 0,
      borderWidth: 1,
      borderColor: colors.barBorder,
      backgroundColor: colors.bg,
    },
    actionInner: {
      width: '100%',
    },
    primaryButton: {
      width: '100%',
    },
  });
}
