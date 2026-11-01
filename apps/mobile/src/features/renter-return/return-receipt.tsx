import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Link } from 'expo-router';
import { useTranslations } from 'use-intl';
import { DROP_POINT_VIEW } from '@hold/domain';
import { Icon, MoneyText, Notice, Panel, Screen, StatusPill, Text } from '@/components/ui';
import { EvidencePhoto, useShopTime } from '@/features/renter-common';
import { useTheme } from '@/theme';
import { ReturnSteps } from './return-steps';
import type { SelfReturn } from './return-screen';

// What PayPal says of the hold now, in the renter's words.
const STANDING: Readonly<Record<string, 'reserved' | 'charged' | 'released'>> = { pending: 'reserved', created: 'reserved', denied: 'reserved', partially_captured: 'charged', captured: 'charged', voided: 'released', expired: 'released' };

// After sending: when it came back, what PayPal holds now, what happens next, and the sealed photographs.
export function ReturnReceipt({ token, view, droppedOffAt, top }: { token: string; view: SelfReturn; droppedOffAt: string; top: ReactNode }) {
  const t = useTranslations('selfReturn.receipt');
  const time = useShopTime(view.timeZone);
  // In the order they were asked for, ending with where the item was left.
  const photos = view.items.flatMap((item) =>
    item.views.flatMap((each) => item.photos.filter((photo) => photo.view === each.key).map((photo) => ({ ...photo, key: `${item.sessionId}-${each.key}`, label: each.key === DROP_POINT_VIEW ? t('dropPointPhoto') : each.label }))),
  );
  return (
    <Screen>
      {top}
      <View className="gap-3">
        <StatusPill label={view.onTime ? t('onTime') : t('late')} tone={view.onTime ? 'success' : 'neutral'} />
        <View className="gap-1">
          <Text variant="label" tone="muted">
            {t('received')}
          </Text>
          <Text variant="headline" selectable>
            {time.time(droppedOffAt)}
          </Text>
          <Text tone="muted">{t('where', { date: time.date(droppedOffAt) })}</Text>
        </View>
      </View>
      {view.missingAt === null ? null : <Notice tone="destructive" title={t('missingTitle', { shop: view.shopName })} body={t('missingBody', { when: time.when(view.missingAt), time: time.time(droppedOffAt) })} />}
      <HoldNow view={view} />
      <ReturnSteps token={token} view={view} droppedOffAt={droppedOffAt} count={photos.length} />
      <Panel title={t('photos')} aside={<RecordLink token={token} />}>
        <View className="gap-3 p-4">
          <Text variant="small" tone="muted">
            {t('photosBody')}
          </Text>
          <View className="flex-row flex-wrap gap-3">
            {photos.map((photo) => (
              <View key={photo.key} className="min-w-0 gap-1" style={{ flexBasis: '46%', flexGrow: 1 }}>
                <EvidencePhoto url={photo.url} label={photo.label} />
                <Text variant="small" tone="muted">
                  {photo.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </Panel>
    </Screen>
  );
}

function HoldNow({ view }: { view: SelfReturn }) {
  const t = useTranslations('selfReturn.receipt');
  const time = useShopTime(view.timeZone);
  const amount = view.paypal?.amountCents ?? view.hold?.reservedCents;
  if (amount === undefined) return null;
  const standing = view.paypal === null ? 'reserved' : (STANDING[view.paypal.status] ?? 'reserved');
  const source = view.simulated ? t('sample') : view.paypal === null ? t('fromRecord') : t('checkedPayPal', { time: time.time(view.paypal.checkedAt) });
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-1 border border-border bg-card p-4">
      <View className="min-w-0 grow basis-40 gap-1">
        <Text variant="bodyStrong">{t(standing)}</Text>
        <Text variant="small" tone="muted">
          {source}
        </Text>
      </View>
      <MoneyText money={{ cents: amount, currency: view.currency }} variant="figure" />
    </View>
  );
}

function RecordLink({ token }: { token: string }) {
  const t = useTranslations('selfReturn.receipt');
  const { color } = useTheme();
  return (
    <Link href={`/r/${token}/record`} asChild>
      <Pressable role="link" aria-label={t('record')} className="min-h-touch flex-row items-center gap-1 active:opacity-70">
        <Text variant="small" tone="primary">
          {t('record')}
        </Text>
        <Icon name="forward" color={color.primary} size={14} />
      </Pressable>
    </Link>
  );
}
