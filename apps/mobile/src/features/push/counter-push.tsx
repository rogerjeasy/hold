import { useCallback } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { useApi } from '@/api';
import { pushAvailable } from '@/push/device';
import { pushStore } from '@/push/push-store';
import { turnOffCounter, turnOnCounter } from '@/push/registration';
import { PushCard, PushProblemNotice } from './push-card';
import { usePushChoice } from './use-push-choice';
import { usePushToggle } from './use-push-toggle';

// Notifications about the counter on this phone. `offerOnly` (on today's screen, after signing in) shows only the
// offer, and what went wrong turning them on; the account screen shows the setting.
export function CounterPush({ shopName, offerOnly = false }: { shopName: string; offerOnly?: boolean }) {
  const t = useTranslations('push');
  const api = useApi();
  const locale = useLocale();
  const choice = usePushChoice(useCallback(() => pushStore.counter(), []));
  const { busy, problem, run } = usePushToggle();
  if (choice === undefined || !pushAvailable()) return null;
  if (offerOnly && choice !== 'offer') return problem === undefined ? null : <PushProblemNotice problem={problem} />;
  return (
    <PushCard
      choice={choice}
      words={{ offerTitle: t('counterOfferTitle'), offerBody: t('counterOfferBody'), onBody: t('counterOnBody', { shop: shopName }), offBody: t('counterOffBody', { shop: shopName }) }}
      problem={problem}
      busy={busy}
      onTurnOn={() => void run(() => turnOnCounter(api, locale, t('channel')))}
      onTurnOff={() => void run(() => turnOffCounter(api, locale))}
      onNotNow={() => void pushStore.setCounter('off')}
    />
  );
}
