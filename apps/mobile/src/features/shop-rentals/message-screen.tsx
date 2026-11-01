import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslations } from 'use-intl';
import { Button, Field, Notice, Screen, Text } from '@/components/ui';
import { RefusalNotice } from '@/features/shop-session/refusal';
import { useStaffAction } from '@/features/shop-session/use-staff-action';

const MESSAGE_MAX = 1000;

// An answer to the renter on their claim, as a sheet over the rental. The renter reads it on their link and is emailed.
export function MessageScreen() {
  const { rentalId } = useLocalSearchParams<{ rentalId: string }>();
  const t = useTranslations('shop.message');
  const common = useTranslations('common');
  const { act, pending, refusal } = useStaffAction();
  const [body, setBody] = useState('');
  const [problem, setProblem] = useState(false);
  const [sent, setSent] = useState(false);
  const send = async () => {
    const text = body.trim();
    setProblem(text === '' || text.length > MESSAGE_MAX);
    if (text === '' || text.length > MESSAGE_MAX) return;
    const answer = await act('write-to-renter', { rentalId, body: text });
    if (answer.ok) setSent(true);
  };
  return (
    <Screen footer={sent ? <Button label={common('done')} onPress={() => router.back()} /> : <Button label={t('send')} icon="send" onPress={() => void send()} loading={pending !== undefined} />}>
      <Text tone="muted">{t('lead')}</Text>
      {sent ? (
        <Notice tone="success" announced title={t('title')} body={t('sent')} />
      ) : (
        <Field label={t('body')} value={body} onChangeText={setBody} multiline maxLength={MESSAGE_MAX} error={problem ? t('needsText') : undefined} textAlignVertical="top" autoFocus />
      )}
      {refusal ? <RefusalNotice refusal={refusal} /> : null}
    </Screen>
  );
}
