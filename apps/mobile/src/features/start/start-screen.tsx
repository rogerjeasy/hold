import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Screen, Text } from '@/components/ui';
import { Wordmark } from '@/components/wordmark';
import { useSavedRentals } from '@/storage/use-saved-rentals';
import { Door } from './door';

// The first screen: what Hold is, and two doors, one for renters and one for shop staff.
export function StartScreen() {
  const t = useTranslations('start');
  const rentals = useSavedRentals();
  const count = rentals?.length ?? 0;
  return (
    <Screen header={false}>
      <View className="gap-5">
        <Wordmark size={44} />
        <Text variant="headline" role="heading">
          {t('tagline')}
        </Text>
      </View>
      <View className="flex-1 justify-end gap-3">
        <Door
          href="/rentals"
          surface="contrast"
          label={t('renter.label')}
          title={t('renter.title')}
          body={t('renter.body')}
          note={count > 0 ? t('renter.saved', { count }) : undefined}
        />
        <Door href="/shop" surface="card" label={t('shop.label')} title={t('shop.title')} body={t('shop.body')} />
      </View>
    </Screen>
  );
}
