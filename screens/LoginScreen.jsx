import React, { useEffect, useMemo, useState, useContext } from 'react';
// import * as SecureStore from 'expo-secure-store';
// do this: https://docs.expo.dev/versions/latest/sdk/auth-session/
import { View, TextInput, Text, StyleSheet, Alert, Pressable, Image, TouchableWithoutFeedback, Keyboard } from 'react-native';
import auth from '@react-native-firebase/auth';
import CountryPicker, { DARK_THEME, DEFAULT_THEME } from 'react-native-country-picker-modal';

import AsyncStorage from '@react-native-async-storage/async-storage'
import { AuthContext } from '@/hooks/AuthContext';
import { useIsDarkMode, usePalette } from '@/hooks/usePalette';
import BottomBar from '@/components/ui/BottomBar';
import { CTAButton, OutlineIconButton } from '@/components/ui/Buttons';
import { createFormStyles } from '@/components/ui/FormStyles';
import { spacing, radii, fontSizes } from '@/theme/tokens';
import FontAwesome from '@expo/vector-icons/FontAwesome';



export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isRegistering, setIsRegistering] = useState(true);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [isPhoneMode, setIsPhoneMode] = useState(true);
  const [countryCode, setCountryCode] = useState('US');
  const [callingCode, setCallingCode] = useState('1');
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const { setUser } = useContext(AuthContext);
  const colors = usePalette();
  const isDarkMode = useIsDarkMode();
  const countryPickerTheme = useMemo(() => (
    isDarkMode ? DARK_THEME : DEFAULT_THEME
  ), [isDarkMode]);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const formStyles = useMemo(() => createFormStyles(colors), [colors]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const handleLogin = async () => {
    try {
      setErrorMsg('');
      await auth().signInWithEmailAndPassword(email, password);

      const user = auth().currentUser;
      if (user) {
        const token = await user.getIdToken();
        await AsyncStorage.setItem('user_token', token);
        setUser({ token });
      }
    } catch (err) {
      setErrorMsg(err?.message || String(err));
    }
  };

  const handleRegister = async () => {
    try {
      setErrorMsg('');
      await auth().createUserWithEmailAndPassword(email, password);
      console.log('Registered new user');
    } catch (err) {
      setErrorMsg(err?.message || String(err));
    }
  };

  const handleSendSms = async () => {
    try {
      setErrorMsg('');
      if (cooldownSeconds > 0) return;
      const nationalDigits = phoneNumber.replace(/\D/g, '');
      if (!nationalDigits) {
        Alert.alert('Missing phone number', 'Please enter your phone number.');
        return;
      }

      // This triggers app verification (silent APNs / reCAPTCHA) and sends the SMS.
      const e164 = `+${callingCode}${nationalDigits}`;
      setSmsCode('');
      setConfirmation({ pending: true });
      setCooldownSeconds(30);
      const confirm = await auth().signInWithPhoneNumber(e164);
      setConfirmation(confirm);
    } catch (err) {
      setConfirmation(null);
      setErrorMsg(err?.message || String(err));
    }
  };

  const handleConfirmCode = async () => {
    try {
      setErrorMsg('');
      if (!confirmation || typeof confirmation.confirm !== 'function') {
        Alert.alert('Starting verification', 'Please wait a moment for the code request to finish.');
        return;
      }
      if (!smsCode) {
        Alert.alert('Missing code', 'Please enter the 6-digit code you received.');
        return;
      }

      await confirmation.confirm(smsCode);

      const user = auth().currentUser;
      if (user) {
        const token = await user.getIdToken();
        await AsyncStorage.setItem('user_token', token);
        setUser({ token });
      }
    } catch (err) {
      setErrorMsg(err?.message || String(err));
    }
  };

  const authTitle = isRegistering ? 'Sign Up' : 'Login';
  const isConfirmationPending = isPhoneMode && confirmation && typeof confirmation.confirm !== 'function';
  const isSmsCooldown = isPhoneMode && !confirmation && cooldownSeconds > 0;
  const primaryAction = isPhoneMode
    ? confirmation
      ? handleConfirmCode
      : handleSendSms
    : isRegistering
      ? handleRegister
      : handleLogin;
  const primaryLabel = isPhoneMode && confirmation ? 'Confirm code' : authTitle;
  const primaryDisabled = isPhoneMode ? (isSmsCooldown || isConfirmationPending) : false;

  const switchToPhone = () => {
    setErrorMsg('');
    setIsPhoneMode(true);
    setConfirmation(null);
    setSmsCode('');
  };

  const switchToEmail = () => {
    setErrorMsg('');
    setIsPhoneMode(false);
    setConfirmation(null);
    setSmsCode('');
  };

  const toggleAuthMode = () => {
    setErrorMsg('');
    setIsRegistering(!isRegistering);
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.container}>
        <View style={styles.heroGlow} />
        <View style={styles.content}>
        <View style={styles.brandBlock}>
          <Image source={require('../assets/images/icon.png')} style={styles.logo} />
          <Text style={styles.brand}>SideQuest</Text>
        </View>

        <Text style={styles.title}>{authTitle}</Text>

        <View style={[formStyles.card, styles.card]}>
          {!isPhoneMode ? (
            <>
              <TextInput
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                style={[formStyles.input, styles.field]}
                placeholderTextColor={colors.textMuted}
                selectionColor={colors.primary}
                cursorColor={colors.text}
              />
              <TextInput
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                style={[formStyles.input, styles.field]}
                placeholderTextColor={colors.textMuted}
                selectionColor={colors.primary}
                cursorColor={colors.text}
              />
            </>
          ) : (
            <>
              <View style={styles.field}>
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
                    placeholder="Phone number"
                    value={phoneNumber}
                    onChangeText={(text) => setPhoneNumber(text.replace(/\D/g, ''))}
                    autoCapitalize="none"
                    keyboardType="phone-pad"
                    style={[formStyles.input, styles.phoneInput]}
                    placeholderTextColor={colors.textMuted}
                    selectionColor={colors.primary}
                    cursorColor={colors.text}
                  />
                </View>
              </View>

              {confirmation ? (
                <>
                  <TextInput
                    placeholder="6-digit code"
                    value={smsCode}
                    onChangeText={setSmsCode}
                    keyboardType="number-pad"
                    style={[formStyles.input, styles.field]}
                    placeholderTextColor={colors.textMuted}
                    selectionColor={colors.primary}
                    cursorColor={colors.text}
                  />
                  {cooldownSeconds > 0 ? (
                    <Text style={styles.cooldownText}>
                      Resend available in {cooldownSeconds}s
                    </Text>
                  ) : (
                    <Pressable onPress={handleSendSms} style={styles.resendLink}>
                      <Text style={styles.resendText}>Resend code</Text>
                    </Pressable>
                  )}
                </>
              ) : (
                <>
                  <Text style={formStyles.helperText}>
                    We will text a 6-digit code to finish {authTitle.toLowerCase()}.
                  </Text>
                  {cooldownSeconds > 0 ? (
                    <Text style={styles.cooldownText}>
                      Request another code in {cooldownSeconds}s
                    </Text>
                  ) : null}
                </>
              )}
            </>
          )}
        </View>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleText}>
            {isRegistering ? 'Already have an account?' : 'No account yet?'}
          </Text>
          <Pressable onPress={toggleAuthMode}>
            <Text style={styles.toggleLink}>
              {isRegistering ? 'Log in' : 'Sign up'}
            </Text>
          </Pressable>
        </View>

        <BottomBar style={styles.actionBar}>
          <View style={styles.actionInner}>
            <CTAButton
              title={primaryLabel}
              onPress={primaryAction}
              variant="filled"
              style={styles.primaryButton}
              disabled={primaryDisabled}
            />
          </View>
        </BottomBar>

        <View style={styles.altMethods}>
          <Text style={styles.altTitle}>Other ways to continue</Text>
          <View style={styles.altRow}>
            <OutlineIconButton
              title="Phone"
              onPress={switchToPhone}
              icon={
                <FontAwesome
                  name="mobile"
                  size={16}
                  color={isPhoneMode ? colors.primary : colors.textMuted}
                />
              }
              style={[styles.methodButton, isPhoneMode && styles.methodButtonActive]}
              textStyle={isPhoneMode ? styles.methodTextActive : null}
            />
            <OutlineIconButton
              title="Email"
              onPress={switchToEmail}
              icon={
                <FontAwesome
                  name="envelope"
                  size={14}
                  color={!isPhoneMode ? colors.primary : colors.textMuted}
                />
              }
              style={[styles.methodButton, styles.methodButtonLast, !isPhoneMode && styles.methodButtonActive]}
              textStyle={!isPhoneMode ? styles.methodTextActive : null}
            />
          </View>
        </View>

        {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    heroGlow: {
      position: 'absolute',
      top: -120,
      right: -80,
      width: 240,
      height: 240,
      borderRadius: 120,
      backgroundColor: colors.primary,
      opacity: 0.08,
    },
    content: {
      flex: 1,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing['2xl'],
      width: '100%',
      maxWidth: 420,
      alignSelf: 'center',
      justifyContent: 'center',
    },
    brandBlock: {
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    logo: {
      width: 72,
      height: 72,
      borderRadius: 18,
      marginBottom: spacing.sm,
    },
    brand: {
      fontSize: fontSizes.xl,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: colors.text,
      fontFamily: 'SpaceMono',
    },
    title: {
      fontSize: fontSizes['2xl'],
      fontWeight: '800',
      letterSpacing: 0.4,
      color: colors.text,
      textAlign: 'center',
      fontFamily: 'SpaceMono',
      marginBottom: spacing.lg,
    },
    subtitle: {
      fontSize: fontSizes.md,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
    },
    card: {
      marginBottom: spacing.md,
    },
    field: {
      marginBottom: spacing.md,
    },
    phoneRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    countryButton: {
      height: 50,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm,
    },
    phoneInput: {
      flex: 1,
    },
    resendLink: {
      marginTop: spacing.xs,
      alignSelf: 'flex-start',
    },
    resendText: {
      color: colors.primary,
      fontWeight: '600',
    },
    cooldownText: {
      color: colors.textMuted,
      marginTop: spacing.xs,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.sm,
      marginBottom: spacing.md,
    },
    toggleText: {
      color: colors.textMuted,
      marginRight: spacing.xs,
    },
    toggleLink: {
      color: colors.primary,
      fontWeight: '600',
    },
    actionBar: {
      marginTop: spacing.sm,
      borderRadius: radii.lg,
      borderTopWidth: 0,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.barBorder,
      backgroundColor: colors.bg,
    },
    actionInner: {
      width: '100%',
    },
    primaryButton: {
      width: '100%',
    },
    altMethods: {
      marginTop: spacing.lg,
    },
    altTitle: {
      color: colors.textMuted,
      fontSize: fontSizes.sm,
      marginBottom: spacing.sm,
      textAlign: 'center',
    },
    altRow: {
      flexDirection: 'row',
    },
    methodButton: {
      flex: 1,
      marginRight: spacing.sm,
    },
    methodButtonLast: {
      marginRight: 0,
    },
    methodButtonActive: {
      borderColor: colors.primary,
    },
    methodTextActive: {
      color: colors.primary,
    },
    error: {
      color: colors.danger,
      marginTop: spacing.md,
      textAlign: 'center',
    },
  });
}
