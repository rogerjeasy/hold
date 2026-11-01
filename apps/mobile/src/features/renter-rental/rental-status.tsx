import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import type { RenterView } from '@hold/mobile-api';
import { Icon, Text, type IconName } from '@/components/ui';
import { ShopLine, useShopTime } from '@/features/renter-common';
import { useTheme } from '@/theme';

type Rental = RenterView<'rental'>['view'];

// Where the rental stands, in one sentence, and what comes next: the web's status line, as the top of the screen.
export function RentalStatus({ view }: { view: Rental }) {
  const t = useTranslations('rental');
  const { color } = useTheme();
  const format = useShopTime(view.timeZone);
  const { text, next, icon } = statusOf(view, t);
  const due = view.state === 'out' || view.state === 'overdue';
  return (
    <View className="gap-3">
      <ShopLine shopName={view.shopName} simulated={view.simulated} />
      <View className="flex-row gap-3">
        <View className="pt-1">
          <Icon name={icon} color={view.state === 'overdue' ? color.warning : color.primary} size={26} />
        </View>
        <Text variant="title" role="heading" className="min-w-0 flex-1">
          {text}
        </Text>
      </View>
      {due ? (
        <View className="flex-row items-center gap-2">
          <Icon name="clock" color={color.mutedForeground} size={18} />
          <Text variant="bodyStrong" selectable className="min-w-0 flex-1">
            {t('dueBack', { when: format.when(view.endsAt) })}
          </Text>
        </View>
      ) : null}
      {next === undefined ? null : <Text tone="muted">{next}</Text>}
    </View>
  );
}

type T = ReturnType<typeof useTranslations<'rental'>>;

function statusOf(view: Rental, t: T): { text: string; next?: string; icon: IconName } {
  switch (view.state) {
    // A booking past its time to pay may still be paid while nobody else has its items, so it still asks for payment.
    case 'pending_payment':
      return { text: t('status.pending_payment'), icon: 'clock' };
    case 'abandoned':
    case 'cancelled':
      return { text: t('status.abandoned'), icon: 'error' };
    case 'awaiting_hold':
      return { text: t('status.awaiting_hold'), next: t('status.holdNext'), icon: 'hold' };
    case 'booked':
      return { text: t('status.booked'), next: t('status.next'), icon: 'success' };
    case 'ready':
      return { text: t('status.ready'), icon: 'success' };
    case 'out':
      return { text: t('status.out'), icon: 'success' };
    case 'dropped_off':
      return { text: t('status.dropped_off'), icon: 'success' };
    default:
      return { text: t('status.other', { state: t(`states.${view.state}`) }), icon: view.state === 'overdue' ? 'warning' : 'info' };
  }
}
