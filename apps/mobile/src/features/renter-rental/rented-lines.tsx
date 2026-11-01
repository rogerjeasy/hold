import { View } from 'react-native';
import { formatMoney, money } from '@hold/domain';
import { useLocale, useTranslations } from 'use-intl';
import type { RenterView } from '@hold/mobile-api';
import { Panel, Text } from '@/components/ui';
import { useShopTime } from '@/features/renter-common';

type Rental = RenterView<'rental'>['view'];

// What the renter rents, each line with its day rate and hold, and the period on the shop's clock.
export function RentedLines({ view }: { view: Rental }) {
  const t = useTranslations('rental');
  const locale = useLocale();
  const format = useShopTime(view.timeZone);
  const price = (cents: number) => formatMoney(money(cents, view.currency), locale);
  return (
    <Panel title={t('what')}>
      {view.lines.map((line, index) => (
        <View key={`${line.name}-${String(line.dayRateCents)}`} className={`gap-0.5 px-4 py-3 ${index === 0 ? '' : 'border-t border-border'}`}>
          <Text variant="bodyStrong">{t('line', { count: line.count, name: line.name })}</Text>
          <Text variant="small" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
            {t('lineTerms', { rate: price(line.dayRateCents), hold: price(line.holdCents) })}
          </Text>
        </View>
      ))}
      <View className="border-t border-border px-4 py-3">
        <Text variant="small" selectable>
          {t('period', { start: format.when(view.startsAt), end: format.when(view.endsAt) })}
        </Text>
      </View>
    </Panel>
  );
}
