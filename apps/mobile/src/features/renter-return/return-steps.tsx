import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Link } from 'expo-router';
import { useTranslations } from 'use-intl';
import type { ColorToken } from '@hold/design-tokens';
import { Icon, Text, type IconName } from '@/components/ui';
import { useShopTime } from '@/features/renter-common';
import { useTheme } from '@/theme';
import type { SelfReturn } from './return-screen';
import { useWhenChecked } from './use-when-checked';

type StepState = 'done' | 'next' | 'waiting' | 'problem';

const LOOK: Readonly<Record<StepState, { icon: IconName; color: ColorToken }>> = {
  done: { icon: 'success', color: 'success' },
  next: { icon: 'clock', color: 'primary' },
  waiting: { icon: 'clock', color: 'mutedForeground' },
  problem: { icon: 'error', color: 'destructive' },
};

const RELEASED = new Set(['released', 'expired']);
const CHARGED = new Set(['captured', 'invoiced']);

function Step({ state, title, last = false, children }: { state: StepState; title: string; last?: boolean; children: ReactNode }) {
  const { color } = useTheme();
  return (
    <View className="flex-row gap-3">
      <View className="items-center">
        <Icon name={LOOK[state].icon} color={color[LOOK[state].color]} size={22} />
        {last ? null : <View className="my-1 w-0.5 flex-1 bg-border" />}
      </View>
      <View className={`min-w-0 flex-1 gap-0.5 ${last ? '' : 'pb-5'}`}>
        <Text variant="bodyStrong">{title}</Text>
        {children}
      </View>
    </View>
  );
}

// The return in three steps: sent by the renter, seen by a person, then the hold released or a claim to answer. The
// words say where each step stands, so colour is never alone.
export function ReturnSteps({ token, view, droppedOffAt, count }: { token: string; view: SelfReturn; droppedOffAt: string; count: number }) {
  const t = useTranslations('selfReturn.steps');
  const { color } = useTheme();
  const time = useShopTime(view.timeZone);
  const whenChecked = useWhenChecked(view);
  const checked = view.rentalState !== 'dropped_off';
  const holdState = view.hold?.state;
  const released = holdState !== undefined && RELEASED.has(holdState);
  const charged = holdState !== undefined && CHARGED.has(holdState);
  const muted = (text: string) => (
    <Text variant="small" tone="muted">
      {text}
    </Text>
  );
  return (
    <View className="gap-4 border border-border bg-card p-4">
      <Text variant="heading" role="heading">
        {t('title')}
      </Text>
      <View>
        <Step state="done" title={t('returned')}>
          {muted(t('returnedDetail', { count, time: time.time(droppedOffAt) }))}
        </Step>
        {checked ? (
          <Step state="done" title={t('checked', { shop: view.shopName })}>
            {muted(t('checkedDetail'))}
          </Step>
        ) : view.missingAt === null ? (
          <Step state="next" title={t('check')}>
            {muted(whenChecked)}
          </Step>
        ) : (
          <Step state="problem" title={t('notFound')}>
            {muted(t('notFoundDetail', { shop: view.shopName }))}
          </Step>
        )}
        {released ? (
          <Step state="done" title={t('released')} last>
            {muted(t('releasedDetail'))}
          </Step>
        ) : charged ? (
          <Step state="done" title={t('charged')} last>
            <Link href={`/r/${token}/claim`} asChild>
              <Pressable role="link" aria-label={t('seeClaim')} className="min-h-touch flex-row items-center gap-1 self-start active:opacity-70">
                <Text tone="primary">{t('seeClaim')}</Text>
                <Icon name="forward" color={color.primary} size={14} />
              </Pressable>
            </Link>
          </Step>
        ) : (
          <Step state="waiting" title={t('settle')} last>
            {muted(t('settleDetail'))}
          </Step>
        )}
      </View>
    </View>
  );
}
