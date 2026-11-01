import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslations } from 'use-intl';
import { Button, ChoiceList, Field, Notice, Screen, Text } from '@/components/ui';
import { RefusalNotice } from '@/features/shop-session/refusal';
import { useStaffAction } from '@/features/shop-session/use-staff-action';

const STATUSES = ['in_service', 'in_repair', 'retired'] as const;
type Status = (typeof STATUSES)[number];

// A flat tyre at the counter: the item goes to repair, or back into service, as a sheet over the rental. Hold refuses
// a change the item's state or the person's role does not allow, and says why.
export function ItemStatusScreen() {
  const { itemId, label } = useLocalSearchParams<{ rentalId: string; itemId: string; label?: string }>();
  const t = useTranslations('shop.itemStatus');
  const common = useTranslations('common');
  const { act, pending, refusal } = useStaffAction();
  const [status, setStatus] = useState<Status | undefined>(undefined);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  const save = async () => {
    if (status === undefined) return;
    const answer = await act('change-item-status', { itemId, status, note: note.trim() });
    if (!answer.ok) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaved(true);
  };
  return (
    <Screen
      footer={saved ? <Button label={common('done')} onPress={() => router.back()} /> : <Button label={t('save')} onPress={() => void save()} disabled={status === undefined} loading={pending !== undefined} />}
    >
      {label ? (
        <Text variant="heading" role="heading">
          {label}
        </Text>
      ) : null}
      <Text tone="muted">{t('lead')}</Text>
      {saved ? (
        <Notice tone="success" announced title={t('title')} body={t('saved')} />
      ) : (
        <>
          <ChoiceList label={t('title')} choices={STATUSES.map((value) => ({ value, label: t(`statuses.${value}`) }))} value={status} onChange={setStatus} />
          <Field label={t('note')} value={note} onChangeText={setNote} maxLength={500} />
        </>
      )}
      {refusal ? <RefusalNotice refusal={refusal} /> : null}
    </Screen>
  );
}
