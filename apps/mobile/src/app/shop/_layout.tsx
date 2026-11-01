import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslations } from 'use-intl';
import { useStaffSession } from '@/storage/use-staff-session';
import { useTheme } from '@/theme';
import { useStackOptions } from '@/theme/stack-options';

// The counter's side. Signed out, only sign-in exists; signed in without a shop, choosing one; in a shop, the tabs
// and what they open. The server checks every request anyway: this only decides what the phone shows.
export default function ShopLayout() {
  const t = useTranslations('shop');
  const { color } = useTheme();
  const options = useStackOptions();
  const session = useStaffSession();
  if (session.status === 'reading') {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={color.mutedForeground} />
      </View>
    );
  }
  const signedIn = session.status === 'signed_in';
  const inShop = signedIn && session.session.shopId !== undefined;
  const sheet = { presentation: 'formSheet' as const, sheetAllowedDetents: [0.75, 1], sheetGrabberVisible: true };
  return (
    <Stack screenOptions={options}>
      <Stack.Protected guard={inShop}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="rental/[rentalId]/index" options={{ title: t('rental.title') }} />
        <Stack.Screen name="rental/[rentalId]/link" options={{ presentation: 'fullScreenModal', headerShown: false }} />
        <Stack.Screen name="rental/[rentalId]/message" options={{ title: t('message.title'), ...sheet }} />
        <Stack.Screen name="rental/[rentalId]/item/[itemId]" options={{ title: t('itemStatus.title'), ...sheet }} />
        <Stack.Screen name="session/[sessionId]/index" options={{ title: '' }} />
        <Stack.Screen name="session/[sessionId]/marks" options={{ title: t('marks.title') }} />
        <Stack.Screen name="review/[comparisonId]" options={{ title: t('review.title'), ...sheet }} />
        <Stack.Screen name="account" options={{ title: t('account.title'), ...sheet }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !inShop}>
        <Stack.Screen name="choose-shop" options={{ title: t('chooseShop.title'), headerLargeTitleEnabled: true }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ title: t('signIn.title'), headerLargeTitleEnabled: true }} />
      </Stack.Protected>
    </Stack>
  );
}
