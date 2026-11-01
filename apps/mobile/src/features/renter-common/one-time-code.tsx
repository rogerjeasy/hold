import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Button, CodeInput, Text } from '@/components/ui';
import { CodeDelivery } from './code-delivery';
import { useRenterAction } from './use-renter-action';

// The four ways to ask Hold for a one-time code. Each sends it the way the renter chose to be reached (a confirmed
// phone, or the email PayPal gave), or by email when asked.
type CodeAction = 'send-claim-code' | 'send-incident-code' | 'send-settlement-code' | 'send-trust-code';

export const CODE_LENGTH = 8;

type OneTimeCodeProps = {
  token: string;
  // The action that sends the code, and its input (the incident, for an incident's code).
  send: CodeAction;
  incidentId?: string;
  // Why a code is needed here, in the screen's words.
  lead: string;
  code: string;
  onCodeChange: (code: string) => void;
  // The problem with the code as typed, from the action that used it (a wrong or expired code).
  error?: string;
};

// Every money decision and every change to a renter's record needs a one-time code, so a link alone cannot decide for
// them (AGENTS.md section 6). One block: ask for the code, see where it went, type it. A renter who got it by text, or
// whose text could not go, may have it emailed instead, so nobody is stuck (as the web's CodeSent). In a demo shop the
// text Hold did not send is shown, labelled.
export function OneTimeCode({ token, send, incidentId, lead, code, onCodeChange, error }: OneTimeCodeProps) {
  const t = useTranslations('renterAction.code');
  const request = useRenterAction(token, send);
  const ask = (via: 'chosen' | 'email') => void request.run({ ...(send === 'send-incident-code' ? { incidentId: incidentId ?? '' } : {}), via });
  const delivery = request.done;
  return (
    <View className="gap-4">
      <View className="gap-3">
        <Text tone="muted">{lead}</Text>
        <Button label={delivery ? t('sendAgain') : t('send')} icon="mail" variant="secondary" loading={request.pending} onPress={() => ask('chosen')} className="self-start" />
        <CodeDelivery delivery={delivery} failed={request.failed} pending={request.pending} onEmailInstead={() => ask('email')} onUseCode={onCodeChange} />
      </View>
      <CodeInput length={CODE_LENGTH} value={code} onChange={onCodeChange} error={error} />
    </View>
  );
}

// The words for a code a decision refused, shared by every screen that takes one.
export function useCodeWording(): Readonly<Record<string, string>> {
  const t = useTranslations('renterAction.code');
  return { code_expired: t('expired'), wrong_code: t('wrong'), code_recently_sent: t('recentlySent'), email_unavailable: t('emailUnavailable'), text_unavailable: t('textUnavailable') };
}
