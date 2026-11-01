import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Button, Panel, Text } from '@/components/ui';
import { ActionFailure, CODE_LENGTH, OneTimeCode, useFailureWords, useRenterAction } from '@/features/renter-common';
import { isCodeProblem, useTrustWording } from './trust-wording';

// The question asked once, in a sentence, and off until the renter turns it on (extensions.md section 7.6). Once
// answered, they may change their mind from any of their links. Each answer needs the renter's emailed code.
export function ConsentPanel({ token, consent, refresh }: { token: string; consent: { answered: boolean; consented: boolean }; refresh: () => void }) {
  const t = useTranslations('trust');
  const wording = useTrustWording();
  const words = useFailureWords(wording);
  const answer = useRenterAction(token, 'answer-consent');
  const [code, setCode] = useState('');
  const current = answer.done === undefined ? consent : { answered: true, consented: answer.done.consented };
  const codeProblem = answer.failed?.failure === 'refused' && isCodeProblem(answer.failed.reason) ? words(answer.failed) : undefined;
  const send = async (choice: 'yes' | 'no') => {
    if ((await answer.run({ code, consent: choice }))?.ok) {
      setCode('');
      refresh();
    }
  };
  const ready = code.length === CODE_LENGTH && !answer.pending;
  return (
    <Panel title={t('consentTitle')}>
      <View className="gap-4 p-4">
        {current.answered ? <Text role={answer.done ? 'status' : undefined}>{current.consented ? t('consentIsOn') : t('consentIsOff')}</Text> : <Text variant="lead">{t('consentQuestion')}</Text>}
        <OneTimeCode token={token} send="send-trust-code" lead={t('codeLead')} code={code} onCodeChange={setCode} error={codeProblem} />
        {current.answered ? (
          <Button label={current.consented ? t('turnOff') : t('turnOn')} variant="secondary" onPress={() => void send(current.consented ? 'no' : 'yes')} loading={answer.pending} disabled={!ready} />
        ) : (
          <View className="gap-3">
            <Button label={t('consentYes')} onPress={() => void send('yes')} loading={answer.pending} disabled={!ready} />
            <Button label={t('consentNo')} variant="secondary" onPress={() => void send('no')} disabled={!ready} />
          </View>
        )}
        {codeProblem === undefined ? <ActionFailure failed={answer.failed} wording={wording} /> : null}
      </View>
    </Panel>
  );
}
