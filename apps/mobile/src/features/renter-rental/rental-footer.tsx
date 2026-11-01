import { router } from 'expo-router';
import { useLocale, useTranslations } from 'use-intl';
import { formatMoney, money } from '@hold/domain';
import type { RenterView } from '@hold/mobile-api';
import { Button } from '@/components/ui';
import { PayPalButton } from '@/features/renter-pay/paypal-button';
import { confirmAt } from '@/features/renter-pay/confirm-at';

type Rental = RenterView<'rental'>['view'];

// The rental's one main action, when it has one: paying the fee (with the hold, for a walk-in) while it is due, or
// approving the hold once the shop asks for it at pickup.
export function RentalFooter({ token, view }: { token: string; view: Rental }) {
  const t = useTranslations();
  const locale = useLocale();
  const fee = formatMoney(money(view.feeCents, view.currency), locale);
  const hold = formatMoney(money(view.holdCents, view.currency), locale);
  if (view.state === 'pending_payment' && view.walkIn) {
    return (
      <PayPalButton
        token={token}
        start="approve-hold"
        label={t('pay.walkIn.approve', { fee, hold })}
        agree={t('pay.walkIn.agree')}
        onReturn={(orderId, closed) => router.push(confirmAt(token, 'pay', orderId, closed))}
      />
    );
  }
  if (view.state === 'pending_payment') {
    return (
      <PayPalButton
        token={token}
        start="pay-fee"
        label={t('pay.pay', { amount: fee })}
        agree={t('pay.agree')}
        onReturn={(orderId, closed) => router.push(confirmAt(token, 'paid', orderId, closed))}
      />
    );
  }
  if (view.state === 'awaiting_hold') {
    return <Button label={t('rental.status.approveHold')} icon="hold" onPress={() => router.push(`/r/${token}/pay`)} />;
  }
  return null;
}

export const hasFooter = (view: Rental) => view.state === 'pending_payment' || view.state === 'awaiting_hold';
