import React, { useMemo, useState } from 'react';
// import * as SecureStore from 'expo-secure-store';
// do this: https://docs.expo.dev/versions/latest/sdk/auth-session/
import { View, TextInput, Button, Text, StyleSheet } from 'react-native';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/config/firebase';

import AsyncStorage from '@react-native-async-storage/async-storage'
import { useContext } from 'react';
import { AuthContext } from '@/hooks/AuthContext';
import { usePalette } from '@/hooks/usePalette';



export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const { setUser } = useContext(AuthContext);
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);

      const user = auth.currentUser;
      if (user) {
        const token = await user.getIdToken();
        // console.log('User token:', token);
        await AsyncStorage.setItem('user_token', token);
        setUser({ token });
      }



    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleRegister = async () => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      console.log('Registered new user');
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        placeholder="Email. Note this screen is controlled under screens > loginscreen.jsx"
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
