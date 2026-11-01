import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { todaySchema, type Today } from '@hold/mobile-api';
import { useAnswer } from '@/api';
import { LoadState, RefreshableScreen, Text } from '@/components/ui';
import { CounterPush } from '@/features/push/counter-push';
import { staffRead } from '@/features/shop-session/staff-request';
import { useSessionKey } from '@/features/shop-session/use-session-key';
import { CounterSection } from './counter-section';
import { DecisionsCard } from './decisions-card';
import { DropOffsCard } from './drop-offs-card';

// The counter's day (architecture.md section 13.7): what goes out and what comes back, in the order of the day, the
// returns waiting at the drop point, and how many decisions wait, which are made on the web.
export function TodayScreen() {
  const t = useTranslations('shop');
  const { state, retry } = useAnswer(`today:${useSessionKey()}`, (api) => staffRead(api, 'shop/today', todaySchema));
  return (
    <RefreshableScreen refreshing={state.status === 'ready' && state.refreshing} onRefresh={retry}>
      <LoadState state={state} onRetry={retry} empty={{ title: '', body: '' }}>
        {(today) => (
          <>
            <Text variant="label" tone="muted" numberOfLines={2}>
              {`${today.shop.name} · ${t(`roles.${today.role}`)}`}
            </Text>
            <CounterPush shopName={today.shop.name} offerOnly />
            <DecisionsCard waiting={today.decisions.waiting} />
            {today.dropOffs.length > 0 ? <DropOffsCard count={today.dropOffs.length} /> : null}
            <Day today={today} />
          </>
        )}
      </LoadState>
    </RefreshableScreen>
  );
}

function Day({ today }: { today: Today }) {
  const t = useTranslations('shop.today');
  if (today.counter.length === 0) {
    return (
      <View className="gap-2 py-2">
        <Text variant="title" role="heading">
          {t('emptyTitle')}
        </Text>
        <Text tone="muted">{t('emptyBody')}</Text>
      </View>
    );
  }
  const visits = { shop: today.shop };
  return (
    <>
      <CounterSection title={t('goingOut')} visits={today.counter.filter((visit) => visit.kind === 'handover')} {...visits} />
      <CounterSection title={t('comingBack')} visits={today.counter.filter((visit) => visit.kind === 'return')} {...visits} />
    </>
  );
}
