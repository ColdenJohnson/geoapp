import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// import * as SecureStore from 'expo-secure-store';
// do this: https://docs.expo.dev/versions/latest/sdk/auth-session/
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
import NetInfo from '@react-native-community/netinfo';
import auth from '@react-native-firebase/auth';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import CountryPicker, { DARK_THEME, DEFAULT_THEME } from 'react-native-country-picker-modal';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { CTAButton } from '@/components/ui/Buttons';
import BottomBar from '@/components/ui/BottomBar';
import { createFormStyles } from '@/components/ui/FormStyles';
import { useIsDarkMode, usePalette } from '@/hooks/usePalette';
import { radii, spacing } from '@/theme/tokens';
import { textStyles } from '@/theme/typography';

const PHONE_DIGIT_MIN_LENGTH = 7;
const CODE_LENGTH = 6;

export default function LoginScreen() {
  const [step, setStep] = useState('phone');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [countryCode, setCountryCode] = useState('US');
  const [callingCode, setCallingCode] = useState('1');
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [isConfirmingCode, setIsConfirmingCode] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const [isAppleAuthAvailable, setIsAppleAuthAvailable] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const codeInputRef = useRef(null);
  const lastAutoSubmittedCodeRef = useRef('');

  const colors = usePalette();
  const isDarkMode = useIsDarkMode();
  const insets = useSafeAreaInsets();
  const countryPickerTheme = useMemo(() => (
    isDarkMode ? DARK_THEME : DEFAULT_THEME
  ), [isDarkMode]);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const formStyles = useMemo(() => createFormStyles(colors), [colors]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return undefined;
    const timer = globalThis.setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          globalThis.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => globalThis.clearInterval(timer);
  }, [cooldownSeconds]);

  useEffect(() => {
    const syncNetworkState = (state) => {
      setIsOffline(state?.isConnected === false || state?.isInternetReachable === false);
    };

    NetInfo.fetch()
      .then(syncNetworkState)
      .catch((error) => {
        console.warn('Failed to inspect network state on login screen', error);
      });

    const unsubscribe = NetInfo.addEventListener(syncNetworkState);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (Platform.OS !== 'ios') {
      setIsAppleAuthAvailable(false);
      return undefined;
    }

    AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (!cancelled) {
          setIsAppleAuthAvailable(Boolean(available));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setIsAppleAuthAvailable(false);
        }
        console.warn('Failed to determine Apple authentication availability', error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
    if (step !== 'verify') {
      return undefined;
    }

    const timer = globalThis.setTimeout(() => {
      codeInputRef.current?.focus();
    }, 150);

    return () => globalThis.clearTimeout(timer);
  }, [step]);

  useEffect(() => {
    if (smsCode.length < CODE_LENGTH) {
      lastAutoSubmittedCodeRef.current = '';
    }
  }, [smsCode]);

  const normalizedPhoneNumber = phoneNumber.replace(/\D/g, '');
  const hasValidPhoneNumber = normalizedPhoneNumber.length >= PHONE_DIGIT_MIN_LENGTH;
  const hasCompleteCode = smsCode.length === CODE_LENGTH;
  const hasEmailCredentials = email.trim().length > 0 && password.length > 0;
  const formattedVerificationPhone = useMemo(() => {
    const e164 = normalizedPhoneNumber ? `+${callingCode}${normalizedPhoneNumber}` : '';
    if (!e164) {
      return '';
    }

    try {
      const parsed = parsePhoneNumberFromString(e164);
      return parsed?.formatInternational() || e164;
    } catch {
      return e164;
    }
  }, [callingCode, normalizedPhoneNumber]);
  const isPrimaryLoading = step === 'phone'
    ? isSendingSms
    : step === 'verify'
      ? isConfirmingCode
      : isEmailLoading;

  const resetPhoneVerification = ({ clearCooldown = false } = {}) => {
    setConfirmation(null);
    setSmsCode('');
    lastAutoSubmittedCodeRef.current = '';
    if (clearCooldown) {
      setCooldownSeconds(0);
    }
  };

  const persistCurrentUserToken = async (missingUserMessage) => {
    const user = auth().currentUser;
    if (!user) {
      throw new Error(missingUserMessage);
    }

    const token = await user.getIdToken();
    await AsyncStorage.setItem('user_token', token);
  };

  const requestPhoneVerification = async () => {
    if (!hasValidPhoneNumber || isSendingSms) {
      return;
    }

    try {
      setErrorMsg('');
      setIsSendingSms(true);
      setSmsCode('');

      // This triggers app verification (silent APNs / reCAPTCHA) and sends the SMS.
      const e164 = `+${callingCode}${normalizedPhoneNumber}`;
      const confirm = await auth().signInWithPhoneNumber(e164);
      setConfirmation(confirm);
      setCooldownSeconds(30);
      setStep('verify');
    } catch (err) {
      setConfirmation(null);
      setErrorMsg(err?.message || String(err));
    } finally {
      setIsSendingSms(false);
    }
  };

  const handleEmailLogin = async () => {
    if (!hasEmailCredentials || isEmailLoading) {
      return;
    }

    try {
      setErrorMsg('');
      setIsEmailLoading(true);
      await auth().signInWithEmailAndPassword(email.trim(), password);
      await persistCurrentUserToken('Email login succeeded, but we could not finish signing you in. Please try again.');
      // AuthContext is sourced from Firebase listeners; avoid writing a partial user object here.
    } catch (err) {
      setErrorMsg(err?.message || String(err));
    } finally {
      setIsEmailLoading(false);
    }
  };

  const handleConfirmCode = useCallback(async () => {
    if (!hasCompleteCode || isConfirmingCode) {
      return;
    }

    try {
      setErrorMsg('');
      setIsConfirmingCode(true);
      if (!confirmation || typeof confirmation.confirm !== 'function') {
        throw new Error('We could not finish setting up phone verification. Please request a new text.');
      }

      await confirmation.confirm(smsCode);
      await persistCurrentUserToken('Verification succeeded, but we could not finish signing you in. Please try again.');
      // AuthContext is sourced from Firebase listeners; avoid writing a partial user object here.
    } catch (err) {
      setErrorMsg(err?.message || String(err));
    } finally {
      setIsConfirmingCode(false);
    }
  }, [confirmation, hasCompleteCode, isConfirmingCode, smsCode]);

  const handleBackFromVerify = () => {
    setErrorMsg('');
    resetPhoneVerification({ clearCooldown: true });
    setStep('phone');
  };

  const handleBackFromEmail = () => {
    setErrorMsg('');
    setStep('phone');
  };

  const handleAppleLogin = async () => {
    if (Platform.OS !== 'ios' || !isAppleAuthAvailable || isAppleLoading) {
      return;
    }

    if (isOffline) {
      setErrorMsg('No network connection. Reconnect to continue.');
      return;
    }

    try {
      setErrorMsg('');
      setIsAppleLoading(true);

      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
      const appleCredential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!appleCredential?.identityToken) {
        throw new Error('Apple sign-in did not return an identity token. Please try again.');
      }

      const firebaseCredential = auth.AppleAuthProvider.credential(
        appleCredential.identityToken,
        rawNonce,
      );

      await auth().signInWithCredential(firebaseCredential);
      await persistCurrentUserToken('Apple sign-in succeeded, but we could not finish signing you in. Please try again.');
    } catch (err) {
      if (err?.code === 'ERR_REQUEST_CANCELED') {
        return;
      }
      setErrorMsg(err?.message || String(err));
    } finally {
      setIsAppleLoading(false);
    }
  };

  useEffect(() => {
    if (step !== 'verify' || smsCode.length !== CODE_LENGTH || isConfirmingCode) {
      return;
    }
    if (lastAutoSubmittedCodeRef.current === smsCode) {
      return;
    }

    lastAutoSubmittedCodeRef.current = smsCode;
    handleConfirmCode();
  }, [handleConfirmCode, isConfirmingCode, smsCode, step]);

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerSide}>
        {step === 'phone' ? (
          <View style={styles.backButtonPlaceholder} />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={step === 'verify' ? handleBackFromVerify : handleBackFromEmail}
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          >
            <FontAwesome name="arrow-left" size={16} color="#FFFFFF" />
          </Pressable>
        )}
      </View>
      <Text style={styles.brand}>SideQuest</Text>
      <View style={styles.headerSide}>
        <View style={styles.backButtonPlaceholder} />
      </View>
    </View>
  );

  const renderPhoneStep = () => (
    <View style={[styles.section, styles.phoneSection]}>
      <Text style={styles.title}>What&apos;s your phone number?</Text>
      <View>
        <View style={styles.phoneRow}>
          <Pressable
            onPress={() => setCountryPickerVisible(true)}
            style={styles.countryButton}
          >
            <CountryPicker
              withFilter
              withFlag
              withCallingCode
              withCallingCodeButton
              countryCode={countryCode}
              theme={countryPickerTheme}
              visible={countryPickerVisible}
              onClose={() => setCountryPickerVisible(false)}
              onSelect={(country) => {
                setCountryCode(country.cca2);
                const nextCallingCode = country.callingCode?.[0];
                if (nextCallingCode) {
                  setCallingCode(nextCallingCode);
                }
                setCountryPickerVisible(false);
              }}
            />
          </Pressable>
          <TextInput
            testID="phone-number-input"
            placeholder="Phone number"
            value={phoneNumber}
            onChangeText={(text) => {
              setPhoneNumber(text.replace(/\D/g, ''));
              if (errorMsg) {
                setErrorMsg('');
              }
            }}
            autoCapitalize="none"
            keyboardType="phone-pad"
            style={[formStyles.input, styles.phoneInput]}
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.primary}
            cursorColor={colors.text}
          />
        </View>
        {isAppleAuthAvailable ? (
          <View style={styles.appleAuthBlock}>
            <Text style={styles.altAuthLabel}>or</Text>
            <View
              pointerEvents={isAppleLoading || isOffline ? 'none' : 'auto'}
              style={[
                styles.appleButtonWrap,
                (isAppleLoading || isOffline) && styles.appleButtonWrapDisabled,
              ]}
            >
              <AppleAuthentication.AppleAuthenticationButton
                testID="apple-sign-in-button"
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={isDarkMode
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={radii.pill}
                style={styles.appleButton}
                onPress={handleAppleLogin}
              />
            </View>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setErrorMsg('');
            setStep('email');
          }}
          style={styles.emailLink}
        >
          <Text style={styles.emailLinkText}>I need to log in with email</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderVerifyStep = () => {
    const codeDigits = Array.from({ length: CODE_LENGTH }, (_, index) => smsCode[index] ?? '');

    return (
      <View style={[styles.section, styles.verifySection]}>
        <Text style={styles.title}>Verify your number</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => codeInputRef.current?.focus()}
          style={styles.codeSlots}
        >
          {codeDigits.map((digit, index) => {
            const isFilled = Boolean(digit);
            const isActive = smsCode.length < CODE_LENGTH && index === smsCode.length;
            return (
              <View
                key={`code-slot-${index}`}
                style={[
                  styles.codeSlot,
                  index < CODE_LENGTH - 1 && styles.codeSlotGap,
                  isFilled && styles.codeSlotFilled,
                  isActive && styles.codeSlotActive,
                ]}
              >
                <Text style={[styles.codeDigit, !isFilled && styles.codePlaceholder]}>
                  {isFilled ? digit : '•'}
                </Text>
              </View>
            );
          })}
          <TextInput
            ref={codeInputRef}
            testID="sms-code-input"
            value={smsCode}
            onChangeText={(text) => {
              setSmsCode(text.replace(/\D/g, '').slice(0, CODE_LENGTH));
              if (errorMsg) {
                setErrorMsg('');
              }
            }}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
            maxLength={CODE_LENGTH}
            selectionColor={colors.primary}
            cursorColor={colors.primary}
            style={styles.hiddenCodeInput}
          />
        </Pressable>
        {cooldownSeconds <= 0 ? (
          <Pressable
            accessibilityRole="button"
            disabled={isSendingSms}
            onPress={requestPhoneVerification}
            style={styles.resendLink}
          >
            <Text style={styles.resendText}>Resend code</Text>
          </Pressable>
        ) : null}
        {formattedVerificationPhone ? (
          <Text style={styles.verificationSentText}>
            Verification code sent to {formattedVerificationPhone}
          </Text>
        ) : null}
      </View>
    );
  };

  const renderEmailStep = () => (
    <View style={styles.section}>
      <Text style={styles.title}>Log in with email</Text>
      <View>
        <TextInput
          testID="email-input"
          placeholder="Email"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            if (errorMsg) {
              setErrorMsg('');
            }
          }}
          autoCapitalize="none"
          keyboardType="email-address"
          style={[formStyles.input, styles.emailField]}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.primary}
          cursorColor={colors.text}
        />
        <TextInput
          testID="password-input"
          placeholder="Password"
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            if (errorMsg) {
              setErrorMsg('');
            }
          }}
          secureTextEntry
          style={formStyles.input}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.primary}
          cursorColor={colors.text}
        />
      </View>
    </View>
  );

  const primaryLabel = step === 'phone' ? 'Send verification text' : step === 'verify' ? 'Continue' : 'Log In';
  const primaryAction = step === 'phone' ? requestPhoneVerification : step === 'verify' ? handleConfirmCode : handleEmailLogin;
  const primaryDisabled = step === 'phone'
    ? !hasValidPhoneNumber || isSendingSms
    : step === 'verify'
      ? !hasCompleteCode || isConfirmingCode || isSendingSms
      : !hasEmailCredentials || isEmailLoading;
  const keyboardOffset = Platform.OS === 'ios'
    ? Math.max(keyboardHeight - insets.bottom, 0)
    : keyboardHeight;
  const actionBarBottom = keyboardOffset > 0 ? keyboardOffset + spacing.sm : spacing.lg;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <SafeAreaView style={styles.container}>
        <View style={styles.screen}>
          {renderHeader()}
          <View style={styles.content}>
            {isOffline ? (
              <View style={styles.offlineBanner}>
                <Text style={styles.offlineBannerText}>
                  No network connection. Reconnect to continue.
                </Text>
              </View>
            ) : null}

            {step === 'phone' ? renderPhoneStep() : null}
            {step === 'verify' ? renderVerifyStep() : null}
            {step === 'email' ? renderEmailStep() : null}

            {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
          </View>

          <BottomBar style={[styles.actionBar, { bottom: actionBarBottom }]}>
            <View style={styles.actionInner}>
              <CTAButton
                title={primaryLabel}
                onPress={primaryAction}
                variant="filled"
                style={styles.primaryButton}
                disabled={primaryDisabled}
                loading={isPrimaryLoading}
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
    brand: {
      ...textStyles.brand,
      color: colors.primary,
      flex: 1,
      textAlign: 'center',
    },
    section: {
      width: '100%',
    },
    phoneSection: {
      marginTop: spacing['2xl'],
    },
    verifySection: {
      marginTop: spacing['2xl'],
    },
    title: {
      ...textStyles.pageTitleCompact,
      color: colors.text,
      textAlign: 'center',
      marginBottom: spacing.xl,
    },
    phoneRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    countryButton: {
      height: 52,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm,
    },
    phoneInput: {
      flex: 1,
    },
    emailLink: {
      alignSelf: 'center',
      marginTop: spacing.sm,
      paddingVertical: spacing.xs,
    },
    appleAuthBlock: {
      marginTop: spacing.lg,
      alignItems: 'center',
    },
    altAuthLabel: {
      ...textStyles.body2xsBold,
      color: colors.textMuted,
      marginBottom: spacing.sm,
      letterSpacing: 0.2,
      textTransform: 'uppercase',
    },
    appleButtonWrap: {
      width: '100%',
      height: 52,
    },
    appleButtonWrapDisabled: {
      opacity: 0.55,
    },
    appleButton: {
      width: '100%',
      height: '100%',
    },
    emailLinkText: {
      ...textStyles.body2xsBold,
      color: isLightColor(colors.surface) ? colors.textMuted : '#FFFFFF',
      letterSpacing: 0.2,
    },
    codeSlots: {
      position: 'relative',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    codeSlot: {
      flex: 1,
      minHeight: 64,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    codeSlotGap: {
      marginRight: spacing.sm,
    },
    codeSlotFilled: {
      borderColor: colors.primary,
    },
    codeSlotActive: {
      borderColor: colors.primary,
      shadowColor: colors.primary,
      shadowOpacity: 0.16,
      shadowOffset: { width: 0, height: 0 },
      shadowRadius: 8,
      elevation: 3,
    },
    codeDigit: {
      ...textStyles.title,
      color: colors.text,
      textAlign: 'center',
    },
    codePlaceholder: {
      color: colors.textMuted,
    },
    hiddenCodeInput: {
      position: 'absolute',
      opacity: 0.01,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    resendLink: {
      alignSelf: 'center',
      marginTop: spacing.lg,
      paddingVertical: spacing.xs,
    },
    resendText: {
      ...textStyles.body2xsBold,
      color: isLightColor(colors.surface) ? colors.textMuted : '#FFFFFF',
      letterSpacing: 0.2,
    },
    verificationSentText: {
      ...textStyles.body2xsBold,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: spacing.lg,
      lineHeight: 18,
    },
    emailField: {
      marginBottom: spacing.md,
    },
    offlineBanner: {
      marginBottom: spacing.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.warning,
      backgroundColor: colors.bg,
    },
    offlineBannerText: {
      ...textStyles.bodySmallStrong,
      color: colors.warning,
      textAlign: 'center',
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
    error: {
      ...textStyles.bodySmallStrong,
      color: colors.danger,
      marginTop: spacing.lg,
      textAlign: 'center',
    },
  });
}

function isLightColor(value) {
  if (typeof value !== 'string' || !value.startsWith('#')) {
    return false;
  }

  const hex = value.length === 4
    ? value.slice(1).split('').map((digit) => `${digit}${digit}`).join('')
    : value.slice(1);

  if (hex.length !== 6) {
    return false;
  }

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);

  if ([red, green, blue].some((channel) => Number.isNaN(channel))) {
    return false;
  }

  const luminance = (0.299 * red) + (0.587 * green) + (0.114 * blue);
  return luminance > 170;
}
