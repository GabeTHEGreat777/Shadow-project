import { SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useMemo, useState } from 'react';

const SHADOWBOARD_WEB_URL = 'https://gabethegreat777.github.io/Shadow-project/';

export default function App() {
  const [hasError, setHasError] = useState(false);
  const source = useMemo(() => ({ uri: SHADOWBOARD_WEB_URL }), []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        {hasError ? (
          <View style={styles.fallback}>
            <Text style={styles.title}>ShadowBoard</Text>
            <Text style={styles.message}>Unable to load web app.</Text>
            <Text style={styles.message}>Open in browser:</Text>
            <Text style={styles.link}>{SHADOWBOARD_WEB_URL}</Text>
          </View>
        ) : (
          <WebView
            source={source}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            setSupportMultipleWindows={false}
            allowsInlineMediaPlayback
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            startInLoadingState
            onError={() => setHasError(true)}
            onHttpError={() => setHasError(true)}
            style={styles.webview}
          />
        )}
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
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  title: {
    color: '#ececf1',
    fontSize: 22,
    fontWeight: '700',
  },
  message: {
    color: '#c7c7cf',
    fontSize: 14,
  },
  link: {
    color: '#9eb6d8',
    fontSize: 14,
    textAlign: 'center',
  },
});
