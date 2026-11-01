import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import type { RenterView } from '@hold/mobile-api';
import { Screen, Text } from '@/components/ui';
import { CaptureSheet, Confirmed, LoadedScreen, notYetAsEmpty, ShopLine, useRenterView, useShopTime } from '@/features/renter-common';
import { ConditionFooter } from './condition-footer';
import { ConditionItem } from './condition-item';
import { nextMissedView, useMissedUpload } from './use-missed-upload';

type Report = RenterView<'condition'>;

// The condition report the renter is sent at handover (architecture.md section 11.2): how each item left, with every
// mark staff noted, and a day to confirm it or photograph what staff missed, so they are never charged for it.
export function ConditionScreen({ token }: { token: string }) {
  const t = useTranslations('condition');
  const { state, retry } = useRenterView(token, 'condition');
  return (
    <LoadedScreen state={notYetAsEmpty(state)} onRetry={retry} empty={{ title: t('title'), body: t('notHandedOver') }} isEmpty={(report) => report === null}>
      {(report) => (report === null ? null : <ConditionReport token={token} report={report} onChanged={retry} />)}
    </LoadedScreen>
  );
}

function ConditionReport({ token, report, onChanged }: { token: string; report: Report; onChanged: () => void }) {
  const t = useTranslations('condition');
  const format = useShopTime(report.timeZone);
  const [adding, setAdding] = useState(false);
  const [itemId, setItemId] = useState<string | undefined>(undefined);
  const item = report.items.find((each) => each.itemId === itemId);
  const upload = useMissedUpload(token, itemId ?? '');
  const answering = report.open && report.reply === null && report.canReply;
  return (
    <Screen
      footer={
        answering ? (
          <ConditionFooter token={token} adding={adding} anyAdded={report.items.some((each) => each.added.length > 0)} onAdding={setAdding} onAnswered={onChanged} />
        ) : undefined
      }
    >
      <View className="gap-3">
        <ShopLine shopName={report.shopName} />
        <Text variant="lead">{t('lead')}</Text>
        {report.reply !== null ? (
          <Confirmed text={report.reply === 'confirmed' ? t('repliedConfirmed') : t('repliedAdded')} />
        ) : report.open ? (
          <Text tone="muted">{t('openUntil', { when: format.when(report.closesAt) })}</Text>
        ) : (
          <Text tone="muted">{t('closed')}</Text>
        )}
        {report.open && report.reply === null && !report.canReply ? <Text tone="muted">{t('otherLink')}</Text> : null}
      </View>
      {report.items.map((each) => (
        <ConditionItem key={each.itemId} item={each} onPhotograph={answering && adding ? () => setItemId(each.itemId) : undefined} />
      ))}
      <CaptureSheet
        target={item === undefined ? undefined : { view: nextMissedView(item.added.length), label: t('missedView'), hint: t('cameraHint') }}
        upload={upload}
        onTaken={() => {
          setItemId(undefined);
          onChanged();
        }}
        onClose={() => setItemId(undefined)}
      />
    </Screen>
  );
}
