// Web-only stub: react-native-vision-camera is not available on web.
import { StyleSheet, Text, View } from 'react-native';
import { usePalette } from '@/hooks/usePalette';

export default function QuickCaptureScreen() {
  const colors = usePalette();
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Text style={styles.icon}>📷</Text>
      <Text style={[styles.title, { color: colors.text }]}>Camera</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Not available in designer mode.{'\n'}
        The camera requires a native device or simulator.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  icon: {
    fontSize: 40,
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
});
