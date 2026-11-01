import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import type { RenterActionOutput } from '@hold/mobile-api';
import { Button } from '@/components/ui';
import { ActionFailure } from './action-failure';
import { Confirmed } from './confirmed';
import { ShownText } from './shown-text';
import type { ActionFailed } from './use-renter-action';

export type Delivery = RenterActionOutput<'send-claim-code'>;

type CodeDeliveryProps = {
  delivery: Delivery | undefined;
  failed: ActionFailed | undefined;
  pending: boolean;
  // Absent where a code can only go where it went.
  onEmailInstead?: () => void;
  // Puts the code from a demo shop's shown text into the screen's field.
  onUseCode?: (code: string) => void;
  // The flow's own words for a code that went by email.
  emailWords?: { readonly sent: string; readonly sandbox: string };
  // The flow's own words for a refusal.
  wording?: Readonly<Record<string, string>>;
};

// Where a one-time code went (architecture.md section 12.3): by text to the masked number, or by email. A renter who
// got it by text, or whose text could not go, may have it sent to their PayPal email instead, so nobody is stuck. In a
// demo shop the text Hold did not send is shown, labelled.
export function CodeDelivery({ delivery, failed, pending, onEmailInstead, onUseCode, emailWords, wording = {} }: CodeDeliveryProps) {
  const t = useTranslations('renterAction.code');
  const textFailed = failed?.failure === 'refused' && failed.reason === 'text_unavailable';
  const email = emailWords ?? { sent: t('sent'), sandbox: t('sentSandbox') };
  const sentWords = delivery === undefined ? undefined : delivery.via === 'text' ? t('sentByText', { phone: delivery.phone ?? '' }) : delivery.sandboxContact ? email.sandbox : email.sent;
  return (
    <View className="gap-3">
      {sentWords ? <Confirmed text={sentWords} /> : null}
      {delivery?.shown ? <ShownText body={delivery.shown} onUseCode={onUseCode} /> : null}
      <ActionFailure failed={failed} wording={{ code_recently_sent: t('recentlySent'), email_unavailable: t('emailUnavailable'), text_unavailable: t('textUnavailable'), ...wording }} />
      {onEmailInstead !== undefined && (delivery?.via === 'text' || textFailed) ? (
        <Button label={t('emailInstead')} icon="mail" variant="secondary" disabled={pending} onPress={onEmailInstead} className="self-start" />
      ) : null}
    </View>
  );
}
