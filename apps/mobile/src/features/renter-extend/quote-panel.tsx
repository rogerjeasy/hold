import { View } from 'react-native';
import { useLocale, useTranslations } from 'use-intl';
import { formatMoney, money } from '@hold/domain';
import { MoneyText, Panel, Text } from '@/components/ui';
import { useShopTime } from '@/features/renter-common';

type Quote = { readonly extraDays: number; readonly feeCents: number; readonly endsAt: string };

// The price Hold set for the days chosen and the new end. The hold is said, plainly, to stay as it is: the days are
// paid on their own.
export function QuotePanel({ quote, timeZone, currency, holdCents }: { quote: Quote; timeZone: string; currency: string; holdCents: number | null }) {
  const t = useTranslations('extend.quote');
  const locale = useLocale();
  const format = useShopTime(timeZone);
  return (
    <Panel title={t('title')}>
      <View className="flex-row flex-wrap gap-x-6 gap-y-3 px-4 py-4">
        <View className="min-w-0 gap-1">
          <Text variant="small" tone="muted">
            {t('days', { count: quote.extraDays })}
          </Text>
          <MoneyText variant="figure" money={{ cents: quote.feeCents, currency }} />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="small" tone="muted">
            {t('newEnd')}
          </Text>
          <Text variant="bodyStrong" selectable>
            {format.when(quote.endsAt)}
          </Text>
        </View>
      </View>
      <Text className="border-t border-border px-4 py-3">{holdCents === null ? t('paidNow') : t('holdUnchanged', { hold: formatMoney(money(holdCents, currency), locale) })}</Text>
    </Panel>
  );
}
