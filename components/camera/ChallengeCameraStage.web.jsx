// Web-only stub: vision camera is not available on web.
import { StyleSheet, Text, View } from 'react-native';

export default function ChallengeCameraStage() {
  return (
    <View style={styles.root}>
      <Text style={styles.text}>Camera not available in designer mode</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 14,
  },
});
