/** Root: fonts, the executor's config, the owner's wallet, and a plain stack (platform transitions only). */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Button, PhoneFrame, Text, colors } from '@/ui';
import { installWebFocusRing } from '@/ui/webFocus';
import { useConfig } from '@/arc/hooks';
import { useWallet } from '@/arc/wallet';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium': require('../assets/fonts/Inter-Medium.ttf'),
    'Inter-SemiBold': require('../assets/fonts/Inter-SemiBold.ttf'),
    'Inter-Bold': require('../assets/fonts/Inter-Bold.ttf'),
    'Inter-ExtraBold': require('../assets/fonts/Inter-ExtraBold.ttf'),
    'Baloo2-Bold': require('../assets/fonts/Baloo2-Bold.ttf'),
    'Baloo2-ExtraBold': require('../assets/fonts/Baloo2-ExtraBold.ttf'),
  });
  const { config, error, load } = useConfig();
  const restore = useWallet((s) => s.restore);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (config) restore(config);
  }, [config, restore]);
  useEffect(() => {
    if (fontsLoaded) {
      void SplashScreen.hideAsync().catch(() => undefined);
      installWebFocusRing();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <PhoneFrame>
          {config?.readOnly ? <View style={{ padding: 12, backgroundColor: colors.bg }}><Text variant="body" color={colors.ink70}>Live Arc {config.network === 'arc-mainnet' ? 'mainnet' : 'testnet'} reads. Start the local executor to run council rounds or autopilot.</Text></View> : null}
          {!config && error ? (
            <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 8 }}>
              <Text variant="screenTitle">The executor is not reachable</Text>
              <Text variant="body" color={colors.ink70}>
                The trading service is temporarily unavailable. Your wallet and on-chain permission are unchanged.
              </Text>
              <Button label="Try again" onPress={() => void load()} testID="retry-executor" />
            </View>
          ) : (
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
          )}
        </PhoneFrame>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
