import { Stack } from 'expo-router';
import { useTranslations } from 'use-intl';
import { HoldConfirmScreen } from '@/features/renter-pay/hold-confirm-screen';
import { HoldScreen } from '@/features/renter-pay/hold-screen';
import { useConfirmParams } from '@/features/renter-pay/use-confirm-params';

// The hold at pickup, as on the web: approving it, and, with PayPal's order, confirming it.
export default function PayRoute() {
  const t = useTranslations('pay.hold');
  const { token, orderId, closed } = useConfirmParams();
  return (
    <>
      <Stack.Screen options={{ title: orderId === undefined ? t('title') : t('return.title') }} />
      {orderId === undefined ? <HoldScreen token={token} /> : <HoldConfirmScreen key={orderId} token={token} orderId={orderId} closed={closed} />}
    </>
  );
}
