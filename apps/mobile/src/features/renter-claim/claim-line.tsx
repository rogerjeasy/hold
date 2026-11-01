import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Icon, MoneyText, Panel, Text } from '@/components/ui';
import { EvidencePhoto, Quoted, useShopTime } from '@/features/renter-common';
import { useTheme } from '@/theme';
import type { RenterClaim } from './claim-screen';

type Line = RenterClaim['lines'][number];

// One line of the claim: what, how much, the reason a person wrote, who recorded it, and the photographs at handover
// and at return side by side, with the damage outlined. A line the renter paid for may show its repair.
export function ClaimLine({ line, currency, timeZone }: { line: Line; currency: string; timeZone: string }) {
  const t = useTranslations('claim');
  const time = useShopTime(timeZone);
  const { color } = useTheme();
  return (
    <Panel title={line.description} aside={<MoneyText money={{ cents: line.amountCents, currency }} />}>
      <View className="gap-4 p-4">
        <Quoted text={line.reason} caption={t('namedBy', { name: line.actorName ?? t('staff') })} />
        <View className="flex-row gap-2">
          {(['beforeUrl', 'afterUrl'] as const).map((side) => (
            <View key={side} className="min-w-0 flex-1 gap-1.5">
              <Text variant="label" tone="muted">
                {t(side)}
              </Text>
              <EvidencePhoto url={line[side]} label={`${t(side)}: ${line.description}`} region={side === 'afterUrl' ? line.region : null} />
            </View>
          ))}
        </View>
        {line.repair === null ? null : (
          <View className="gap-2 border-t border-border pt-3">
            <View className="flex-row items-center gap-2">
              <Icon name="success" color={color.success} size={20} />
              <Text variant="bodyStrong" tone="success">
                {t('repairedOn', { date: time.date(line.repair.repairedAt) })}
              </Text>
            </View>
            <Text variant="small" tone="muted">
              {t('repairedBody')}
            </Text>
            {line.repair.url === null ? null : (
              <View className="w-1/2">
                <EvidencePhoto url={line.repair.url} label={t('repairedAlt', { line: line.description })} />
              </View>
            )}
          </View>
        )}
      </View>
    </Panel>
  );
}
