import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import type { Money } from '@hold/domain';
import { Button, MoneyText, Panel, Text } from '@/components/ui';
import { ActionFailure, CODE_LENGTH, Confirmed, OneTimeCode, useCodeWording, useFailureWords, useRenterAction } from '@/features/renter-common';

// The renter's final tap (extensions.md section 9.9): a fresh one-time code, then confirm or decline the amount the
// advocates agreed. Nothing is charged until they confirm.
export function SettlementConfirm({ token, agreed, refresh }: { token: string; agreed: Money; refresh: () => void }) {
  const t = useTranslations('negotiation.confirm');
  const results = useTranslations('negotiation.results');
  const wording = { ...useCodeWording(), not_agreed: results('not_agreed') };
  const words = useFailureWords(wording);
  const decide = useRenterAction(token, 'confirm-settlement');
  const [code, setCode] = useState('');
  const [decision, setDecision] = useState<'confirm' | 'decline' | undefined>(undefined);
  const codeProblem = decide.failed?.failure === 'refused' && (decide.failed.reason === 'wrong_code' || decide.failed.reason === 'code_expired') ? words(decide.failed) : undefined;
  const answer = async (choice: 'confirm' | 'decline') => {
    setDecision(choice);
    if ((await decide.run({ code, decision: choice }))?.ok) refresh();
  };
  return (
    <Panel title={t('renterTitle')}>
      <View className="gap-4 p-4">
        <View className="gap-1">
          <Text variant="label" tone="muted">
            {t('agreedLabel')}
          </Text>
          <MoneyText money={agreed} variant="headline" />
        </View>
        <Text>{t('renterGuidance')}</Text>
        <OneTimeCode token={token} send="send-settlement-code" lead={t('lead')} code={code} onCodeChange={setCode} error={codeProblem} />
        {decide.done ? (
          <Confirmed text={t('done')} />
        ) : (
          <View className="gap-3">
            <Button label={t('confirm')} onPress={() => void answer('confirm')} loading={decide.pending && decision === 'confirm'} disabled={code.length < CODE_LENGTH || decide.pending} />
            <Button label={t('decline')} variant="secondary" onPress={() => void answer('decline')} loading={decide.pending && decision === 'decline'} disabled={code.length < CODE_LENGTH || decide.pending} />
          </View>
        )}
        {codeProblem === undefined ? <ActionFailure failed={decide.failed} wording={wording} /> : null}
      </View>
    </Panel>
  );
}
