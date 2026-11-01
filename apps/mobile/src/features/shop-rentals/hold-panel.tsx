import { View } from 'react-native';
import { router } from 'expo-router';
import { useFormatter, useTranslations } from 'use-intl';
import type { RentalView } from '@hold/mobile-api';
import { Button, MoneyText, Panel, Text } from '@/components/ui';

const ASKING = ['booked', 'awaiting_hold'];
const HOLD_STATES = ['placed', 'requested', 'released', 'captured'] as const;
type HoldState = (typeof HOLD_STATES)[number];
const known = (state: string): state is HoldState => HOLD_STATES.some((each) => each === state);

// The hold at pickup: what PayPal reserved, and, once the fee is paid, asking the renter for it. Asking moves no
// money; the renter approves it in PayPal on their own phone, from the code this opens.
export function HoldPanel({ rental, act }: { rental: RentalView; act: boolean }) {
  const t = useTranslations('shop.rental.hold');
  const format = useFormatter();
  const asking = act && ASKING.includes(rental.state);
  const { hold } = rental;
  if (hold === null && !asking) return null;
  const state = hold === null ? undefined : known(hold.state) ? hold.state : 'other';
  return (
    <Panel title={t('title')} aside={<MoneyText money={{ cents: hold?.reservedCents ?? rental.holdCents, currency: hold?.currency ?? rental.currency }} />}>
      <View className="gap-3 p-4">
        <Text tone="muted">{state === undefined ? t('none') : t(state)}</Text>
        {hold?.assuredUntil && hold.state === 'placed' ? (
          <Text variant="small" tone="muted">
            {t('assuredUntil', { date: format.dateTime(new Date(hold.assuredUntil), { dateStyle: 'medium', timeStyle: 'short' }) })}
          </Text>
        ) : null}
        {asking ? (
          <>
            <Button icon="hold" label={t('ask')} onPress={() => router.push({ pathname: '/shop/rental/[rentalId]/link', params: { rentalId: rental.id, purpose: 'hold' } })} />
            <Text variant="small" tone="muted">
              {t('askHint')}
            </Text>
          </>
        ) : null}
      </View>
    </Panel>
  );
}
