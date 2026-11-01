import { useCallback } from 'react';
import { useTranslations } from 'use-intl';
import { useApi } from '@/api';
import { pushAvailable } from '@/push/device';
import { pushStore } from '@/push/push-store';
import { notNowForRental, turnOffRental, turnOnRental } from '@/push/registration';
import { PushCard } from './push-card';
import { usePushChoice } from './use-push-choice';
import { usePushToggle } from './use-push-toggle';

// Notifications about this rental on this phone, offered on the rental's page once it is saved here, and its setting.
export function RentalPush({ token }: { token: string }) {
  const t = useTranslations('push');
  const api = useApi();
  const choice = usePushChoice(useCallback(async () => (await pushStore.rental(token))?.state, [token]));
  const { busy, problem, run } = usePushToggle();
  if (choice === undefined || !pushAvailable()) return null;
  return (
    <PushCard
      choice={choice}
      words={{ offerTitle: t('offerTitle'), offerBody: t('offerBody'), onBody: t('onBody'), offBody: t('offBody') }}
      problem={problem}
      busy={busy}
      onTurnOn={() => void run(() => turnOnRental(api, token, t('channel')))}
      onTurnOff={() => void run(() => turnOffRental(api, token))}
      onNotNow={() => void notNowForRental(token)}
    />
  );
}
