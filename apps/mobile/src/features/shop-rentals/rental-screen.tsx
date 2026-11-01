import { View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useFormatter, useTranslations } from 'use-intl';
import { rentalViewSchema, type RentalView } from '@hold/mobile-api';
import { useAnswer } from '@/api';
import { Button, LoadState, MoneyText, Notice, RefreshableScreen, SampleLabel, StatusPill, Text } from '@/components/ui';
import { DropOffActions } from '@/features/shop-drop-offs/drop-off-actions';
import { staffRead } from '@/features/shop-session/staff-request';
import { useRefreshOnFocus } from '@/features/shop-session/use-refresh-on-focus';
import { useSessionKey } from '@/features/shop-session/use-session-key';
import { HoldPanel } from './hold-panel';
import { ItemsPanel } from './items-panel';
import { LinkPanel } from './link-panel';
import { isLive, rentalState } from './rental-state';

const CLAIM_STATES = ['returned', 'inspecting', 'settling'];

// One rental at the counter: where it stands, its items to hand over or take back, the hold and the renter's link.
// What staff act on comes first; money decisions are left to the web.
export function RentalScreen() {
  const { rentalId } = useLocalSearchParams<{ rentalId: string }>();
  const t = useTranslations('shop');
  const path = `shop/rentals/${encodeURIComponent(rentalId)}`;
  const { state, retry } = useAnswer(`${path}:${useSessionKey()}`, (api) => staffRead(api, path, rentalViewSchema));
  useRefreshOnFocus(retry);
  return (
    <RefreshableScreen refreshing={state.status === 'ready' && state.refreshing} onRefresh={retry}>
      <LoadState state={state} onRetry={retry} empty={{ title: '', body: '' }}>
        {(rental) => (
          <>
            <Stack.Screen options={{ title: rental.who ?? t('rentals.renter') }} />
            <Rental rental={rental} onChanged={retry} />
          </>
        )}
      </LoadState>
    </RefreshableScreen>
  );
}

function Rental({ rental, onChanged }: { rental: RentalView; onChanged: () => void }) {
  const t = useTranslations('shop');
  const common = useTranslations('common');
  const act = rental.canAct && isLive(rental);
  const claim = CLAIM_STATES.includes(rental.state);
  return (
    <>
      <Summary rental={rental} />
      {rental.simulated ? <Notice title={common('sample')} body={t('rental.sample')} /> : null}
      {!rental.canAct ? <Text tone="muted">{t('rental.readOnly')}</Text> : null}
      {rental.dropOff !== null && rental.dropOff.missingAt === null && act ? <DropOffActions rentalId={rental.id} onConfirmed={onChanged} /> : null}
      <ItemsPanel rental={rental} act={act} />
      <HoldPanel rental={rental} act={act} />
      {act ? <LinkPanel rental={rental} /> : null}
      {claim ? (
        <View className="gap-3">
          <Notice title={t('refusal.web.title')} body={t('rental.decidedOnWeb')} />
          {act ? <Button variant="secondary" icon="message" label={t('rental.message.title')} onPress={() => router.push(`/shop/rental/${rental.id}/message`)} className="self-start" /> : null}
        </View>
      ) : null}
    </>
  );
}

function Summary({ rental }: { rental: RentalView }) {
  const t = useTranslations('shop');
  const format = useFormatter();
  const state = rentalState(rental.state);
  const when = t('rentals.period', {
    start: format.dateTime(new Date(rental.startsAt), { dateStyle: 'medium', timeStyle: 'short' }),
    end: format.dateTime(new Date(rental.endsAt), { dateStyle: 'medium', timeStyle: 'short' }),
  });
  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <StatusPill label={t(`states.${state.key}`)} tone={state.tone} />
        {rental.simulated ? <SampleLabel /> : null}
      </View>
      <View className="flex-row flex-wrap gap-x-8 gap-y-3">
        <View className="min-w-0 shrink gap-0.5">
          <Text variant="label" tone="muted">
            {t('rental.when')}
          </Text>
          <Text selectable>{when}</Text>
        </View>
        <View className="gap-0.5">
          <Text variant="label" tone="muted">
            {t('rental.fee')}
          </Text>
          <MoneyText money={{ cents: rental.feeCents, currency: rental.currency }} />
        </View>
      </View>
    </View>
  );
}
