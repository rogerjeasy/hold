import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import type { Money } from '@hold/domain';
import { Button, MoneyText, Text } from '@/components/ui';
import { ActionFailure, CODE_LENGTH, OneTimeCode, useCodeWording, useFailureWords, useRenterAction } from '@/features/renter-common';

// Agreeing the published price a staff member confirmed, with the one-time code used for every money decision, or
// leaving it for the return. Nothing is charged either way.
export function IncidentAgree({ token, incidentId, price, refresh }: { token: string; incidentId: string; price: Money; refresh: () => void }) {
  const t = useTranslations('incident.agree');
  const wording = useCodeWording();
  const words = useFailureWords(wording);
  const [code, setCode] = useState('');
  const agree = useRenterAction(token, 'agree-incident-price');
  const leave = useRenterAction(token, 'leave-incident-to-return');
  const codeProblem = agree.failed?.failure === 'refused' && agree.failed.reason !== undefined && agree.failed.reason in wording ? words(agree.failed) : undefined;
  const settle = async (answer: Promise<{ ok: boolean } | undefined>) => {
    if ((await answer)?.ok) refresh();
  };
  return (
    <View className="gap-6">
      <OneTimeCode token={token} send="send-incident-code" incidentId={incidentId} lead={t('codeGuidance')} code={code} onCodeChange={setCode} error={codeProblem} />
      <View className="gap-2">
        <Button label={t('agree')} onPress={() => void settle(agree.run({ incidentId, code }))} loading={agree.pending} disabled={code.length < CODE_LENGTH || leave.pending} />
        <View className="flex-row flex-wrap items-baseline gap-x-2">
          <Text variant="small" tone="muted">
            {t('agreeing')}
          </Text>
          <MoneyText money={price} variant="small" />
        </View>
        {codeProblem === undefined ? <ActionFailure failed={agree.failed} /> : null}
      </View>
      <View className="gap-3 border-t border-border pt-4">
        <Text tone="muted">{t('leaveGuidance')}</Text>
        <Button label={t('leave')} variant="secondary" onPress={() => void settle(leave.run({ incidentId }))} loading={leave.pending} disabled={agree.pending} />
        <ActionFailure failed={leave.failed} />
      </View>
    </View>
  );
}
