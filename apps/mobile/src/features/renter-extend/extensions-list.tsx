import { View } from 'react-native';
import { useLocale, useTranslations } from 'use-intl';
import { formatMoney, money } from '@hold/domain';
import type { RenterView } from '@hold/mobile-api';
import { Icon, Panel, Text, type IconName } from '@/components/ui';
import { useShopTime } from '@/features/renter-common';
import { useTheme } from '@/theme';

type Extension = RenterView<'extension'>['extensions'][number];

const LOOK: Readonly<Record<Extension['state'], { icon: IconName; tone: 'success' | 'mutedForeground' | 'destructive' }>> = {
  paid: { icon: 'success', tone: 'success' },
  capturing: { icon: 'clock', tone: 'mutedForeground' },
  failed: { icon: 'error', tone: 'destructive' },
};

// Each extension the renter paid for, being paid, or that PayPal refused, newest first, in words.
export function ExtensionsList({ extensions, timeZone, currency }: { extensions: readonly Extension[]; timeZone: string; currency: string }) {
  const t = useTranslations('extend.list');
  const locale = useLocale();
  const { color } = useTheme();
  const format = useShopTime(timeZone);
  if (extensions.length === 0) return null;
  return (
    <Panel title={t('title')}>
      {extensions.map((extension, index) => (
        <View key={extension.id} className={`flex-row gap-3 px-4 py-3 ${index === 0 ? '' : 'border-t border-border'}`}>
          <Icon name={LOOK[extension.state].icon} color={color[LOOK[extension.state].tone]} size={20} />
          <Text selectable className="min-w-0 flex-1">
            {t(extension.state, { days: extension.extraDays, amount: formatMoney(money(extension.amountCents, currency), locale), when: format.when(extension.toEndsAt) })}
          </Text>
        </View>
      ))}
    </Panel>
  );
}
