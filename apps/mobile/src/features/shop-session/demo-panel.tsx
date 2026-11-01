import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Button, Panel, SampleLabel, Text } from '@/components/ui';
import { RefusalNotice } from './refusal';
import { DEMO_ACCOUNTS, useKeptDemo } from './demo-store';
import { useDemoSignIn } from './use-demo-sign-in';

// The judges' way in, as on the web's demo page: one tap as Tomás, the owner, or Jonas, at the counter. A phone that
// started a demo comes back to it as either person, or starts a fresh one. Everything in it is a sample.
export function DemoPanel() {
  const t = useTranslations('shop.demo');
  const kept = useKeptDemo();
  const { start, pending, refusal } = useDemoSignIn();
  const choice = kept ? 'continue' : 'start';
  return (
    <Panel title={t('title')} aside={<SampleLabel />}>
      <View className="gap-4 p-4">
        <Text tone="muted">{kept ? t('leadCurrent') : t('lead')}</Text>
        {DEMO_ACCOUNTS.map((account) => (
          <View key={account} className="gap-1.5">
            <Button
              label={t(`${account}.${choice}`)}
              variant="secondary"
              icon={account === 'owner' ? 'shop' : 'person'}
              loading={pending === account}
              disabled={pending !== undefined && pending !== account}
              onPress={() => void start(account, kept?.demo)}
            />
            <Text variant="small" tone="muted">
              {t(`${account}.hint`)}
            </Text>
          </View>
        ))}
        {kept ? (
          <View className="gap-1.5">
            <Button label={t('fresh')} variant="secondary" icon="retake" loading={pending === 'fresh'} disabled={pending !== undefined && pending !== 'fresh'} onPress={() => void start('owner', undefined, 'fresh')} />
            <Text variant="small" tone="muted">
              {t('freshHint')}
            </Text>
          </View>
        ) : null}
        {refusal ? <RefusalNotice refusal={refusal} /> : null}
        <Text variant="small" tone="muted">
          {t('note')}
        </Text>
      </View>
    </Panel>
  );
}
