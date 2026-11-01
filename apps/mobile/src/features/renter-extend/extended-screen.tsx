import { router } from 'expo-router';
import { useTranslations } from 'use-intl';
import { confirmAt } from '@/features/renter-pay/confirm-at';
import { PayPalConfirm } from '@/features/renter-pay/paypal-confirm';

// Refusals after which the renter chooses the days again before paying.
const CHOOSE_AGAIN = ['declined', 'quote_stale', 'not_free', 'beyond_hold', 'too_many_days', 'not_out', 'order_mismatch'];

// Back from PayPal after paying for more days. The worker captures them; the new end already holds.
export function ExtendedScreen({ token, orderId, closed }: { token: string; orderId: string; closed: boolean }) {
  const t = useTranslations('extend');
  return (
    <PayPalConfirm
      token={token}
      orderId={orderId}
      closed={closed}
      confirm="confirm-extension"
      start="pay-extension"
      stillWorking={(output) => output.state === 'capturing'}
      held={{ when: (output) => output.state === 'reviewing', text: t('extended.reviewing') }}
      view="extension"
      isDone={(value) => value.extensions.some((extension) => extension.orderId === orderId && extension.state === 'paid')}
      texts={{ checking: t('extended.checking'), done: t('extended.done') }}
      next={{ href: `/r/${token}/extend`, label: t('extended.back') }}
      elsewhere={{ href: `/r/${token}/extend`, label: t('extended.again'), reasons: CHOOSE_AGAIN }}
      wording={{ quote_stale: t('refused.quote_stale'), not_out: t('refused.not_out') }}
      onReopened={(order, wasClosed) => router.setParams(confirmAt(token, 'extended', order, wasClosed).params)}
    />
  );
}
