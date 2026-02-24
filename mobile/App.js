import { ActivityIndicator, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';

const SHADOWBOARD_WEB_URL = 'https://gabethegreat777.github.io/Shadow-project/';

export default function App() {
  const [hasError, setHasError] = useState(false);
  const [isBiometricReady, setIsBiometricReady] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const source = useMemo(() => ({ uri: SHADOWBOARD_WEB_URL }), []);
  const canShowWeb = isUnlocked || isBiometricReady === false;

  const unlockWithBiometrics = useCallback(async () => {
    setIsAuthChecking(true);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) {
        setIsBiometricReady(false);
        setIsUnlocked(true);
        setIsAuthChecking(false);
        return;
      }

      setIsBiometricReady(true);
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock ShadowBoard',
        fallbackLabel: 'Use device passcode',
        disableDeviceFallback: false,
        cancelLabel: 'Cancel',
      });

      if (result.success) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setIsUnlocked(true);
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setIsUnlocked(false);
      }
    } catch {
      setIsBiometricReady(false);
      setIsUnlocked(true);
    } finally {
      setIsAuthChecking(false);
    }
  }, []);

  const lockApp = useCallback(async () => {
    setIsUnlocked(false);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  useEffect(() => {
    unlockWithBiometrics();
  }, [unlockWithBiometrics]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        {isAuthChecking ? (
          <View style={styles.fallback}>
            <ActivityIndicator size="large" color="#9eb6d8" />
            <Text style={styles.message}>Checking secure access...</Text>
          </View>
        ) : !canShowWeb ? (
          <View style={styles.fallback}>
            <Text style={styles.title}>ShadowBoard Locked</Text>
            <Text style={styles.message}>Use Face ID / Touch ID to continue.</Text>
            <Pressable onPress={unlockWithBiometrics} style={styles.actionBtn}>
              <Text style={styles.actionText}>Unlock</Text>
            </Pressable>
          </View>
        ) : hasError ? (
          <View style={styles.fallback}>
            <Text style={styles.title}>ShadowBoard</Text>
            <Text style={styles.message}>Unable to load web app.</Text>
            <Text style={styles.message}>Open in browser:</Text>
            <Text style={styles.link}>{SHADOWBOARD_WEB_URL}</Text>
          </View>
        ) : (
          <>
            {isBiometricReady ? (
              <View style={styles.lockBar}>
                <Text style={styles.lockText}>Secure Session</Text>
                <Pressable onPress={lockApp} style={styles.lockBtn}>
                  <Text style={styles.lockBtnText}>Lock</Text>
                </Pressable>
              </View>
            ) : null}
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
              pullToRefreshEnabled
              onError={() => setHasError(true)}
              onHttpError={() => setHasError(true)}
              style={styles.webview}
            />
          </>
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
  actionBtn: {
    marginTop: 12,
    backgroundColor: '#2c3442',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionText: {
    color: '#e9edf5',
    fontWeight: '600',
  },
  lockBar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#30303a',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lockText: {
    color: '#aeb4c2',
    fontSize: 12,
  },
  lockBtn: {
    backgroundColor: '#282f3c',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  lockBtnText: {
    color: '#e4e8ef',
    fontSize: 12,
    fontWeight: '600',
  },
});
