import React, { useMemo, useState } from 'react';
// import * as SecureStore from 'expo-secure-store';
// do this: https://docs.expo.dev/versions/latest/sdk/auth-session/
import { View, TextInput, Button, Text, StyleSheet, Alert } from 'react-native';
import auth from '@react-native-firebase/auth';

import AsyncStorage from '@react-native-async-storage/async-storage'
import { useContext } from 'react';
import { AuthContext } from '@/hooks/AuthContext';
import { usePalette } from '@/hooks/usePalette';



export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [isPhoneMode, setIsPhoneMode] = useState(false);
  const { setUser } = useContext(AuthContext);
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

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
      if (!phoneNumber) {
        Alert.alert('Missing phone number', 'Please enter a phone number in E.164 format, e.g. +15551234567');
        return;
      }

      // This triggers app verification (silent APNs / reCAPTCHA) and sends the SMS.
      const confirm = await auth().signInWithPhoneNumber(phoneNumber);
      setConfirmation(confirm);
    } catch (err) {
      setErrorMsg(err?.message || String(err));
    }
  };

  const handleConfirmCode = async () => {
    try {
      setErrorMsg('');
      if (!confirmation) {
        Alert.alert('No verification in progress', 'Tap “Send code” first.');
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

  return (
    <View style={styles.container}>
      <Button
        title={isPhoneMode ? 'Use Email/Password Instead' : 'Use SMS Login Instead'}
        onPress={() => {
          setErrorMsg('');
          setIsPhoneMode(!isPhoneMode);
          setConfirmation(null);
          setSmsCode('');
        }}
      />
      <View style={{ height: 16 }} />
      {!isPhoneMode ? (
        <>
          <TextInput
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.primary}
            cursorColor={colors.text}
          />
          <TextInput
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.primary}
            cursorColor={colors.text}
          />
          {isRegistering ? (
            <Button title="Register" onPress={handleRegister} />
          ) : (
            <Button title="Login" onPress={handleLogin} />
          )}
          <Text
            onPress={() => setIsRegistering(!isRegistering)}
            style={{ color: colors.primary, marginTop: 16 }}
          >
            {isRegistering ? 'Already have an account? Log in' : 'No account? Register'}
          </Text>
        </>
      ) : (
        <>
          <TextInput
            placeholder="Phone number (e.g. +15551234567)"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            autoCapitalize="none"
            keyboardType="phone-pad"
            style={styles.input}
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.primary}
            cursorColor={colors.text}
          />

          {confirmation ? (
            <>
              <TextInput
                placeholder="6-digit code"
                value={smsCode}
                onChangeText={setSmsCode}
                keyboardType="number-pad"
                style={styles.input}
                placeholderTextColor={colors.textMuted}
                selectionColor={colors.primary}
                cursorColor={colors.text}
              />
              <Button title="Confirm code" onPress={handleConfirmCode} />
              <View style={{ height: 12 }} />
              <Button title="Resend code" onPress={handleSendSms} />
            </>
          ) : (
            <Button title="Send code" onPress={handleSendSms} />
          )}
        </>
      )}

      {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      padding: 24,
      flex: 1,
      justifyContent: 'center',
      backgroundColor: colors.bg,
    },
    input: {
      height: 44,
      borderBottomWidth: 1,
      borderColor: colors.border,
      marginBottom: 20,
      color: colors.text,
    },
    error: {
      color: colors.danger,
      marginTop: 8,
    },
  });
}
