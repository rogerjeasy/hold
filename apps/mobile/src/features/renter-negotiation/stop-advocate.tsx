import { Alert, View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Button, Text } from '@/components/ui';
import { ActionFailure, useRenterAction } from '@/features/renter-common';

// The way to stop the agent acting for the renter (extensions.md section 3, rule 7). It charges nothing, and the system
// asks once before, since it cannot be undone.
export function StopAdvocate({ token, refresh }: { token: string; refresh: () => void }) {
  const t = useTranslations('negotiation.stop');
  const common = useTranslations('common');
  const stop = useRenterAction(token, 'stop-advocate');
  const run = async () => {
    if ((await stop.run({}))?.ok) refresh();
  };
  const ask = () =>
    Alert.alert(t('title'), t('guidance'), [
      { text: t('button'), style: 'destructive', onPress: () => void run() },
      { text: common('cancel'), style: 'cancel' },
    ]);
  return (
    <View className="gap-3 border-t border-border pt-4">
      <Text variant="heading" role="heading">
        {t('title')}
      </Text>
      <Text tone="muted">{t('guidance')}</Text>
      <Button label={t('button')} variant="destructive" onPress={ask} loading={stop.pending} />
      <ActionFailure failed={stop.failed} />
    </View>
  );
}
