import '../../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { AppProviders } from '@/components/app-providers';
import { PushResponder } from '@/push/push-responder';
import { FONT_FILES } from '@/theme/fonts';
import { useStackOptions } from '@/theme/stack-options';

// The native splash stays up until Hold's fonts are ready, so no screen draws in a system font and then jumps.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, failed] = useFonts(FONT_FILES);
  const ready = loaded || failed !== null;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;
  return (
    <AppProviders>
      <StatusBar style="auto" />
      <PushResponder />
      <RootStack />
    </AppProviders>
  );
}

function RootStack() {
  const options = useStackOptions();
  return (
    <Stack screenOptions={{ ...options, headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(renter)" />
      <Stack.Screen name="shop" />
      <Stack.Screen name="+not-found" options={{ headerShown: true, title: '' }} />
    </Stack>
  );
}
