import { useState } from 'react';
import { Alert, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslations } from 'use-intl';
import { Button, Notice } from '@/components/ui';
import { RefusalNotice } from '@/features/shop-session/refusal';
import { useStaffAction } from '@/features/shop-session/use-staff-action';

// What a person at the drop point records (architecture.md section 6.13): the item is there, so its return can be
// reviewed, or it is not, which records who looked and when. Neither moves money: the hold stays either way.
export function DropOffActions({ rentalId, onConfirmed }: { rentalId: string; onConfirmed: () => void }) {
  const t = useTranslations('shop.dropOffs');
  const common = useTranslations('common');
  const { act, pending, refusal } = useStaffAction();
  const [recorded, setRecorded] = useState<'recorded' | 'recordedTold' | undefined>(undefined);

  const confirm = async () => {
    const answer = await act('confirm-drop-off', { rentalId });
    if (!answer.ok) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirmed();
  };
  const reportMissing = () =>
    Alert.alert(t('confirmTitle'), t('confirmBody'), [
      { text: common('cancel'), style: 'cancel' },
      {
        text: t('confirm'),
        style: 'destructive',
        onPress: async () => {
          const answer = await act('report-drop-off-missing', { rentalId });
          if (answer.ok) setRecorded(answer.value.emailed ? 'recordedTold' : 'recorded');
        },
      },
    ]);

  if (recorded) return <Notice tone="success" announced title={t('notHere')} body={t(recorded)} />;
  return (
    <View className="gap-3">
      <Button label={t('here')} icon="check" onPress={() => void confirm()} loading={pending === 'confirm-drop-off'} disabled={pending !== undefined} />
      <Button label={t('notHere')} variant="destructive" onPress={reportMissing} loading={pending === 'report-drop-off-missing'} disabled={pending !== undefined} />
      {refusal ? <RefusalNotice refusal={refusal} /> : null}
    </View>
  );
}
