import React, { useState } from 'react';
// import * as SecureStore from 'expo-secure-store';
// do this: https://docs.expo.dev/versions/latest/sdk/auth-session/
import { View, TextInput, Button, Text, StyleSheet } from 'react-native';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../config/firebase';

import AsyncStorage from '@react-native-async-storage/async-storage'



export default function LoginScreen( {onLogin} ) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  const handleLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      console.log('Logged in current user: ', auth.currentUser);

      const user = auth.currentUser;
      console.log('User:', user);
      if (user) {
        const token = await user.getIdToken();
        console.log('User token:', token);
        await AsyncStorage.setItem('user_token', token);
        onLogin(token); // calls the onLogin function passed as a prop --> goes to _layout.jsx, setUser(user)
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
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={styles.input}
      />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={styles.input}
      />
      {isRegistering ? (
        <Button title="Register" onPress={handleRegister} />
      ) : (
        <Button title="Login" onPress={handleLogin} />
      )}
            <Text
        onPress={() => setIsRegistering(!isRegistering)}
        style={{ color: 'blue', marginTop: 16 }}
      >
        {isRegistering ? 'Already have an account? Log in' : 'No account? Register'}
      </Text>

      {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    flex: 1,
    justifyContent: 'center',
  },
  input: {
    height: 40,
    borderBottomWidth: 1,
    marginBottom: 20,
  },
  error: {
    color: 'red',
    marginTop: 8,
  },
});