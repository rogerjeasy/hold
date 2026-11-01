import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslations } from 'use-intl';
import { Button, Screen, Text } from '@/components/ui';
import { useSavedRentals } from '@/storage/use-saved-rentals';
import { useTheme } from '@/theme';
import { SavedRentalRow } from './saved-rental-row';

// The renter's way in: the rentals this phone keeps, and the two ways to add one, scanning the shop's code or pasting
// the link from the email. A link opened from outside the app lands on its rental directly.
export function RentalsScreen() {
  const t = useTranslations('rentals');
  const { color } = useTheme();
  const rentals = useSavedRentals();
  return (
    <Screen
      footer={
        <>
          <Button label={t('scan')} icon="scan" onPress={() => router.push('/scan')} />
          <Button label={t('paste')} icon="paste" variant="secondary" onPress={() => router.push('/add-link')} />
        </>
      }
    >
      {rentals === undefined ? (
        <ActivityIndicator color={color.mutedForeground} className="py-12" />
      ) : rentals.length === 0 ? (
        <View className="gap-3 pt-2">
          <Text variant="title" role="heading">
            {t('empty.title')}
          </Text>
          <Text tone="muted">{t('empty.body')}</Text>
        </View>
      ) : (
        <View className="border-y border-border bg-card">
          {rentals.map((rental, index) => (
            <SavedRentalRow key={rental.token} rental={rental} first={index === 0} />
          ))}
        </View>
      )}
    </Screen>
  );
}
