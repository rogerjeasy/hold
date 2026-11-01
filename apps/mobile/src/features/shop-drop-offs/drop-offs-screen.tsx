import { View } from 'react-native';
import { router } from 'expo-router';
import { useFormatter, useTranslations } from 'use-intl';
import { todaySchema, type Today } from '@hold/mobile-api';
import { useAnswer } from '@/api';
import { LoadState, RefreshableScreen, SampleLabel, Text } from '@/components/ui';
import { staffRead } from '@/features/shop-session/staff-request';
import { useSessionKey } from '@/features/shop-session/use-session-key';
import { DropOffActions } from './drop-off-actions';

// Items renters returned with nobody at the counter, waiting for a person to look at the drop point.
export function DropOffsScreen() {
  const t = useTranslations('shop.dropOffs');
  const { state, retry } = useAnswer(`drop-offs:${useSessionKey()}`, (api) => staffRead(api, 'shop/today', todaySchema));
  return (
    <RefreshableScreen refreshing={state.status === 'ready' && state.refreshing} onRefresh={retry}>
      <LoadState state={state} onRetry={retry} isEmpty={(today) => today.dropOffs.length === 0} empty={{ title: t('emptyTitle'), body: t('emptyBody') }}>
        {(today) => (
          <>
            <Text tone="muted">{t('lead')}</Text>
            {today.dropOffs.map((dropOff) => (
              <DropOffCard key={dropOff.rentalId} dropOff={dropOff} today={today} onConfirmed={retry} />
            ))}
          </>
        )}
      </LoadState>
    </RefreshableScreen>
  );
}

function DropOffCard({ dropOff, today, onConfirmed }: { dropOff: Today['dropOffs'][number]; today: Today; onConfirmed: () => void }) {
  const t = useTranslations('shop.dropOffs');
  const format = useFormatter();
  const renter = dropOff.renterName ?? t('renter');
  const when = format.dateTime(new Date(dropOff.droppedOffAt), { dateStyle: 'medium', timeStyle: 'short', timeZone: today.shop.timeZone });
  return (
    <View className="gap-4 border border-l-4 border-border border-l-warning bg-card p-4">
      <View className="gap-1">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Text variant="heading" role="heading" className="shrink">
            {renter}
          </Text>
          {dropOff.simulated ? <SampleLabel /> : null}
        </View>
        <Text variant="small" tone="muted">
          {t('returned', { when })}
        </Text>
      </View>
      {today.role === 'read_only' ? null : (
        <DropOffActions
          rentalId={dropOff.rentalId}
          onConfirmed={() => {
            onConfirmed();
            router.push(`/shop/rental/${dropOff.rentalId}`);
          }}
        />
      )}
    </View>
  );
}
