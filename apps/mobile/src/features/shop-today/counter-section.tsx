import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useFormatter, useTranslations } from 'use-intl';
import type { Today } from '@hold/mobile-api';
import { Icon, MoneyText, SampleLabel, StatusPill, Text } from '@/components/ui';
import { useTheme } from '@/theme';

type Visit = Today['counter'][number];
type Shop = Today['shop'];

// One half of the day, going out or coming back, each visit a row that opens its rental.
export function CounterSection({ title, visits, shop }: { title: string; visits: readonly Visit[]; shop: Shop }) {
  const t = useTranslations('shop.today');
  return (
    <View className="gap-2">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text variant="heading" role="heading">
          {title}
        </Text>
        <Text variant="small" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
          {String(visits.length)}
        </Text>
      </View>
      {visits.length === 0 ? (
        <Text tone="muted">{t('none')}</Text>
      ) : (
        <View className="border-y border-border bg-card">
          {visits.map((visit, index) => (
            <VisitRow key={`${visit.rentalId}:${visit.kind}`} visit={visit} shop={shop} first={index === 0} />
          ))}
        </View>
      )}
    </View>
  );
}

const HOLD_LABEL = { placed: 'placed', requested: 'requested', released: 'released', captured: 'captured' } as const;

function VisitRow({ visit, shop, first }: { visit: Visit; shop: Shop; first: boolean }) {
  const t = useTranslations('shop.today');
  const format = useFormatter();
  const { color } = useTheme();
  const time = format.dateTime(new Date(visit.at), { timeStyle: 'short', timeZone: shop.timeZone });
  const who = visit.renterName ?? t('renter');
  const status = visit.done ? t('done') : t('toDo');
  const hold = visit.hold === null ? undefined : HOLD_LABEL[visit.hold.state as keyof typeof HOLD_LABEL];
  return (
    <Pressable
      role="button"
      aria-label={`${time}, ${who}, ${visit.items.join(', ')}, ${status}`}
      onPress={() => router.push(`/shop/rental/${visit.rentalId}`)}
      className={`min-h-touch flex-row gap-3 px-4 py-3.5 active:bg-accent ${first ? '' : 'border-t border-border'}`}
    >
      <Text variant="bodyStrong" className="w-20" style={{ fontVariant: ['tabular-nums'] }}>
        {time}
      </Text>
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="bodyStrong" numberOfLines={2}>
          {who}
        </Text>
        <Text variant="small" tone="muted" numberOfLines={2}>
          {visit.items.join(', ')}
        </Text>
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
          <StatusPill label={status} tone={visit.done ? 'success' : 'primary'} />
          {visit.hold === null ? (
            <Text variant="small" tone="muted">
              {t('hold.none')}
            </Text>
          ) : (
            <>
              <Text variant="small" tone="muted">
                {hold === undefined ? '' : t(`hold.${hold}`)}
              </Text>
              {shop.currency === null ? null : <MoneyText variant="small" money={{ cents: visit.hold.reservedCents, currency: shop.currency }} />}
            </>
          )}
          {visit.simulated ? <SampleLabel /> : null}
        </View>
      </View>
      <View className="justify-center">
        <Icon name="forward" color={color.mutedForeground} size={18} />
      </View>
    </Pressable>
  );
}
