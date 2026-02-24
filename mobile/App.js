import { SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { SHADOWBOARD_DATA_URI } from './src/shadowboardDataUri';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        <WebView
          source={{ uri: SHADOWBOARD_DATA_URI }}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          allowsInlineMediaPlayback
          style={styles.webview}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1f',
  },
  webview: {
    flex: 1,
    backgroundColor: '#1a1a1f',
  },
});
