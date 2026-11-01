import { useState } from 'react';
import { Alert, Pressable, Switch, View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Button, Panel, Text } from '@/components/ui';
import { ActionFailure, CODE_LENGTH, Confirmed, OneTimeCode, useFailureWords, useRenterAction } from '@/features/renter-common';
import { useTheme } from '@/theme';
import { isCodeProblem, useTrustWording } from './trust-wording';

// Deleting the record, from any rental link, returns the renter to the ordinary hold at every Hold shop. The switch
// must be on first, the renter's emailed code given, and the system asks once more, so it is never one stray tap.
export function DeleteRecord({ token }: { token: string }) {
  const t = useTranslations('trust');
  const common = useTranslations('common');
  const { color } = useTheme();
  const wording = useTrustWording();
  const words = useFailureWords(wording);
  const remove = useRenterAction(token, 'delete-record');
  const [understood, setUnderstood] = useState(false);
  const [code, setCode] = useState('');
  const codeProblem = remove.failed?.failure === 'refused' && isCodeProblem(remove.failed.reason) ? words(remove.failed) : undefined;
  const ask = () =>
    Alert.alert(t('delete'), t('deleteLead'), [
      { text: t('delete'), style: 'destructive', onPress: () => void remove.run({ code, understood: 'yes' }) },
      { text: common('cancel'), style: 'cancel' },
    ]);
  return (
    <Panel title={t('delete')}>
      <View className="gap-4 p-4">
        {remove.done ? (
          <Confirmed text={t('deleted')} />
        ) : (
          <>
            <Text tone="muted">{t('deleteLead')}</Text>
            <Pressable onPress={() => setUnderstood((now) => !now)} className="min-h-touch flex-row items-center gap-3" accessible={false}>
              <Text className="min-w-0 flex-1">{t('deleteConfirm')}</Text>
              <Switch
                value={understood}
                onValueChange={setUnderstood}
                aria-label={t('deleteConfirm')}
                trackColor={{ true: color.destructive, false: color.borderStrong }}
                thumbColor={color.card}
                ios_backgroundColor={color.borderStrong}
              />
            </Pressable>
            <OneTimeCode token={token} send="send-trust-code" lead={t('codeLead')} code={code} onCodeChange={setCode} error={codeProblem} />
            <Button label={t('delete')} icon="trash" variant="destructive" onPress={ask} loading={remove.pending} disabled={!understood || code.length < CODE_LENGTH} />
            {codeProblem === undefined ? <ActionFailure failed={remove.failed} wording={wording} /> : null}
          </>
        )}
      </View>
    </Panel>
  );
}
