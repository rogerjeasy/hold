import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslations } from 'use-intl';
import { Button, ChoiceList, Field, Notice, Screen, Text } from '@/components/ui';
import { RefusalNotice } from '@/features/shop-session/refusal';
import { useStaffAction } from '@/features/shop-session/use-staff-action';

const OUTCOMES = ['clean', 'findings', 'deferred'] as const;
type Outcome = (typeof OUTCOMES)[number];
const NOTE_MAX = 1000;

// A person's own look at a returned item, beside the comparison of its photographs: what they saw and why, saved with
// their name. It moves no money; a claim, if any, is prepared and approved on the web.
export function ReviewScreen() {
  const { comparisonId } = useLocalSearchParams<{ comparisonId: string }>();
  const t = useTranslations('shop.review');
  const common = useTranslations('common');
  const { act, pending, refusal } = useStaffAction();
  const [outcome, setOutcome] = useState<Outcome | undefined>(undefined);
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const record = async () => {
    if (outcome === undefined) return;
    const text = reason.trim();
    setProblem(text === '');
    if (text === '') return;
    const answer = await act('record-review', { comparisonId, outcome, reason: text.slice(0, NOTE_MAX) });
    if (!answer.ok) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRecorded(true);
  };
  return (
    <Screen
      footer={recorded ? <Button label={common('done')} onPress={() => router.back()} /> : <Button label={t('record')} onPress={() => void record()} disabled={outcome === undefined} loading={pending !== undefined} />}
    >
      <Text tone="muted">{t('lead')}</Text>
      {recorded ? (
        <Notice tone="success" announced title={t('title')} body={t('recorded')} />
      ) : (
        <>
          <ChoiceList label={t('outcome')} choices={OUTCOMES.map((value) => ({ value, label: t(`outcomes.${value}`) }))} value={outcome} onChange={setOutcome} />
          <Field label={t('notes')} value={reason} onChangeText={setReason} multiline maxLength={NOTE_MAX} error={problem ? t('needsNote') : undefined} textAlignVertical="top" />
        </>
      )}
      {refusal ? <RefusalNotice refusal={refusal} /> : null}
    </Screen>
  );
}
