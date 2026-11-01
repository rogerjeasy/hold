import { router } from 'expo-router';
import { useTranslations } from 'use-intl';
import { confirmAt } from './confirm-at';
import { PayPalConfirm } from './paypal-confirm';

// Back from PayPal after approving the fee. The worker captures it with PayPal, which is what books the rental.
export function FeeConfirmScreen({ token, orderId, closed }: { token: string; orderId: string; closed: boolean }) {
  const t = useTranslations('pay.paid');
  return (
    <PayPalConfirm
      token={token}
      orderId={orderId}
      closed={closed}
      confirm="confirm-fee"
      start="pay-fee"
      stillWorking={(output) => output.state === 'capturing'}
      view="rental"
      isDone={(value) => value.view.state !== 'pending_payment'}
      texts={{ checking: t('checking'), done: t('done') }}
      next={{ href: `/r/${token}`, label: t('back') }}
      reopenOn={['declined']}
      onReopened={(order, wasClosed) => router.setParams(confirmAt(token, 'paid', order, wasClosed).params)}
    />
  );
}
