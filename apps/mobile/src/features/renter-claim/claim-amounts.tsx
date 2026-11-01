import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { MoneyText, Panel, Text } from '@/components/ui';
import type { RenterClaim } from './claim-screen';

// What settling the claim means for the renter's hold: the part charged, the part released, any separate invoice.
export function ClaimAmounts({ claim }: { claim: RenterClaim }) {
  const t = useTranslations('claim');
  const rows = [
    { key: 'capture', label: t('capture'), cents: claim.captureCents },
    { key: 'release', label: t('release'), cents: claim.releaseCents },
    ...(claim.invoiceCents > 0 ? [{ key: 'invoice', label: t('invoice'), cents: claim.invoiceCents }] : []),
  ];
  return (
    <Panel title={t('summary')}>
      {rows.map((row, index) => (
        <View key={row.key} className={`min-h-touch flex-row flex-wrap items-center justify-between gap-x-4 px-4 py-3 ${index === 0 ? '' : 'border-t border-border'}`}>
          <Text className="shrink">{row.label}</Text>
          <MoneyText money={{ cents: row.cents, currency: claim.currency }} variant={row.key === 'capture' ? 'figure' : 'bodyStrong'} />
        </View>
      ))}
    </Panel>
  );
}
