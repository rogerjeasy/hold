import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Button, Icon, MoneyText, Panel, Screen, Text } from '@/components/ui';
import { ActionFailure, useRenterAction } from '@/features/renter-common';
import { useTheme } from '@/theme';
import type { SelfReturn } from './return-screen';
import { useWhenChecked } from './use-when-checked';

// Before the camera: where to leave it, and the promise that nothing is charged before a person has seen it.
export function ReturnIntro({ token, view, top, refresh }: { token: string; view: SelfReturn; top: ReactNode; refresh: () => void }) {
  const t = useTranslations('selfReturn.intro');
  const { color } = useTheme();
  const whenChecked = useWhenChecked(view);
  const start = useRenterAction(token, 'start-self-return');
  const begin = async () => {
    if ((await start.run({}))?.ok) refresh();
  };
  return (
    <Screen
      footer={
        view.canAct ? (
          <>
            <ActionFailure failed={start.failed} />
            <Button label={t('start')} icon="camera" onPress={() => void begin()} loading={start.pending} />
          </>
        ) : undefined
      }
    >
      {top}
      <Text variant="title" role="heading">
        {t('title')}
      </Text>
      {view.dropPoint === null ? null : (
        <Panel title={t('dropPointLabel')}>
          <View className="flex-row gap-3 p-4">
            <Icon name="place" color={color.primary} size={24} />
            <View className="min-w-0 flex-1 gap-1.5">
              <Text variant="heading" selectable>
                {view.dropPoint}
              </Text>
              <Text variant="small" tone="muted">
                {t('writtenBy', { shop: view.shopName })}
              </Text>
            </View>
          </View>
        </Panel>
      )}
      <Panel title={t('nextLabel')}>
        <View className="gap-3 p-4">
          <Text variant="bodyStrong">{t('nothingCharged')}</Text>
          <Text>{whenChecked}</Text>
          {view.hold === null ? null : (
            <View className="gap-1 border-t border-border pt-3">
              <View className="flex-row flex-wrap items-baseline justify-between gap-x-3">
                <Text tone="muted">{t('yourHold')}</Text>
                <MoneyText money={{ cents: view.hold.reservedCents, currency: view.currency }} />
              </View>
              <Text tone="muted">{t('holdStays')}</Text>
            </View>
          )}
        </View>
      </Panel>
      <View className="gap-2">
        <Text>{t('how')}</Text>
        <Text tone="muted">{t('light')}</Text>
      </View>
      {view.canAct ? null : (
        <Text tone="muted" role="note">
          {t('noScope')}
        </Text>
      )}
    </Screen>
  );
}
