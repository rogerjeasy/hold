import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useFormatter, useTranslations } from 'use-intl';
import type { RentalSummary } from '@hold/mobile-api';
import { Icon, SampleLabel, StatusPill, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { rentalState } from './rental-state';

// One rental in the list: who, what, when and where it stands.
export function RentalRow({ rental, first }: { rental: RentalSummary; first: boolean }) {
  const t = useTranslations('shop');
  const format = useFormatter();
  const { color } = useTheme();
  const who = rental.who ?? t('rentals.renter');
  const state = rentalState(rental.state);
  const when = t('rentals.period', {
    start: format.dateTime(new Date(rental.startsAt), { dateStyle: 'medium' }),
    end: format.dateTime(new Date(rental.endsAt), { dateStyle: 'medium' }),
  });
  return (
    <Pressable
      role="button"
      aria-label={`${who}, ${rental.items.join(', ')}, ${t(`states.${state.key}`)}`}
      onPress={() => router.push(`/shop/rental/${rental.id}`)}
      className={`min-h-touch flex-row items-center gap-3 px-4 py-3.5 active:bg-accent ${first ? '' : 'border-t border-border'}`}
    >
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="bodyStrong" numberOfLines={2}>
          {who}
        </Text>
        <Text variant="small" tone="muted" numberOfLines={2}>
          {rental.items.join(', ')}
        </Text>
        <Text variant="small" tone="muted">
          {when}
        </Text>
        <View className="flex-row flex-wrap items-center gap-2">
          <StatusPill label={t(`states.${state.key}`)} tone={state.tone} />
          {rental.simulated ? <SampleLabel /> : null}
        </View>
      </View>
      <Icon name="forward" color={color.mutedForeground} size={18} />
    </Pressable>
  );
}
