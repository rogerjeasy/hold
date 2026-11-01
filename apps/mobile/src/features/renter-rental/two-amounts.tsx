import { useWindowDimensions, View } from 'react-native';
import { useTranslations } from 'use-intl';
import type { RenterView } from '@hold/mobile-api';
import { MoneyText, Panel, Text } from '@/components/ui';

type Rental = RenterView<'rental'>['view'];

// From this width the two amounts sit side by side: a phone held sideways, or a tablet.
const WIDE = 560;

// The fee and the hold, never added together: one is paid, the other only reserved (project-description.md section
// 6.2). Side by side on a wide screen, one above the other on a phone held upright.
export function TwoAmounts({ view }: { view: Rental }) {
  const t = useTranslations('rental');
  const paid = view.state !== 'pending_payment' && view.state !== 'abandoned';
  const sideBySide = useWindowDimensions().width >= WIDE;
  return (
    <Panel title={t('twoAmounts')}>
      <View className={sideBySide ? 'flex-row' : ''}>
        <View className={`gap-1 px-4 py-4 ${sideBySide ? 'flex-1' : ''}`}>
          <Text variant="small" tone="muted">
            {t('fee')}
          </Text>
          <MoneyText variant="figure" money={{ cents: view.feeCents, currency: view.currency }} />
          <Text variant="small" tone="muted">
            {paid ? t('feePaid') : t('feeNow')}
          </Text>
        </View>
        <View className={`gap-1 px-4 py-4 ${sideBySide ? 'flex-1 border-l' : 'border-t'} border-border`}>
          <Text variant="small" tone="muted">
            {t('hold')}
          </Text>
          <MoneyText variant="figure" money={{ cents: view.holdCents, currency: view.currency }} />
          <Text variant="small" tone="muted">
            {t('holdBody')}
          </Text>
        </View>
      </View>
      <View className="border-t border-border px-4 py-3">
        <Text variant="small">{t('holdRules', { hours: view.replyPeriodHours })}</Text>
      </View>
    </Panel>
  );
}
