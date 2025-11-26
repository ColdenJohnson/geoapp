// app/enter_message.jsx
import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { useRouter } from 'expo-router';

import BottomBar from '@/components/ui/BottomBar';
import { CTAButton, SecondaryButton } from '@/components/ui/Buttons';

import { usePalette } from '@/hooks/usePalette';
import { spacing, radii } from '@/theme/tokens';

import { resolveMessage } from '../lib/promiseStore';

const MAX_LEN = 200;

export default function EnterMessageScreen() {
  const [message, setMessage] = useState('');
  const router = useRouter();
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const remaining = useMemo(() => MAX_LEN - message.length, [message]); // character counter

  // TODO: There is no error handling when no message is entered
  // *****************************************************************
  function onSave() {
    // Optional trim; keep empty string if user wants no message
    resolveMessage(message.trim());
    console.log("WARNING: IF NO MESSAGE ENTERED, DOES NOT UPLOAD TO SERVER DUE TO API BEHAVIOR. NEED TO ADD ERROR HANDLING")
    router.back();
  }

  function onCancel() {
    resolveMessage(null); // caller can detect cancellation
    router.back();
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={styles.container}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Add a challenge note</Text>

          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Write a short message for this challenge…"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={MAX_LEN}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
            style={styles.input}
            textAlignVertical="top"
          />

          <Text style={[styles.counter, remaining < 0 && styles.counterOver]}>
            {remaining}
          </Text>
        </View>

        <BottomBar>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <SecondaryButton title="Cancel" onPress={onCancel} style={{ flex: 1 }} />
            <CTAButton title="Save" onPress={onSave} style={{ flex: 1 }} />
          </View>
        </BottomBar>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { flex: 1, padding: spacing.lg },
    title: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginBottom: spacing.md,
    },
    input: {
      height: 120,
      fontSize: 16,
      lineHeight: 22,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
    },
    counter: {
      marginTop: spacing.sm,
      alignSelf: 'flex-end',
      fontSize: 12,
      color: colors.textMuted,
    },
    counterOver: { color: colors.danger },
  });
}
