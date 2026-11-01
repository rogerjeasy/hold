import { router } from 'expo-router';
import { useTranslations } from 'use-intl';
import { useRenterView } from '@/features/renter-common';
import { confirmAt } from './confirm-at';
import { PayPalConfirm } from './paypal-confirm';

// Back from PayPal after approving the hold. The worker authorizes it with PayPal, which is what places it. A declined
// hold reserved nothing, and the renter approves again, perhaps with another way to pay.
export function HoldConfirmScreen({ token, orderId, closed }: { token: string; orderId: string; closed: boolean }) {
  const t = useTranslations('pay');
  const { state } = useRenterView(token, 'hold');
  const walkIn = state.status === 'ready' && state.value.hold?.strategy === 'combined';
  return (
    <PayPalConfirm
      token={token}
      orderId={orderId}
      closed={closed}
      confirm="confirm-hold"
      start="approve-hold"
      stillWorking={(output) => output.state === 'placing'}
      view="hold"
      isDone={(value) => value.hold?.state === 'placed'}
      texts={{ checking: t('hold.return.checking'), done: walkIn ? t('walkIn.done') : t('hold.return.done') }}
      next={{ href: `/r/${token}`, label: t('hold.back') }}
      reopenOn={['declined', 'hold_refused']}
      againLabel={t('hold.return.again')}
      wording={{ declined: t('hold.declined') }}
      onReopened={(order, wasClosed) => router.setParams(confirmAt(token, 'pay', order, wasClosed).params)}
    />
  );
}
