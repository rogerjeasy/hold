import { Pressable, View } from 'react-native';
import { Link } from 'expo-router';
import { useFormatter, useTranslations } from 'use-intl';
import type { RenterView } from '@hold/mobile-api';
import { Icon, Panel, Text } from '@/components/ui';
import { useTheme } from '@/theme';

// The reports the renter made before, newest as Hold lists them, each opening its own page.
export function EarlierReports({ token, earlier }: { token: string; earlier: RenterView<'incidents'>['earlier'] }) {
  const t = useTranslations('incident');
  const format = useFormatter();
  const { color } = useTheme();
  if (earlier.length === 0) return null;
  return (
    <Panel title={t('earlier')}>
      {earlier.map((report, index) => {
        const state = t(`states.${report.state}`);
        const when = format.dateTime(new Date(report.reportedAt), { dateStyle: 'medium', timeStyle: 'short' });
        return (
          <Link key={report.id} href={`/r/${token}/incident/${report.id}`} asChild>
            <Pressable role="link" aria-label={`${report.itemLabel}, ${state}, ${when}`} className={`min-h-touch flex-row items-center gap-3 px-4 py-3 active:bg-accent ${index === 0 ? '' : 'border-t border-border'}`}>
              <View className="min-w-0 flex-1 gap-0.5">
                <Text variant="bodyStrong">{report.itemLabel}</Text>
                <Text variant="small" tone="muted">
                  {state} · {when}
                </Text>
              </View>
              <Icon name="forward" color={color.mutedForeground} size={18} />
            </Pressable>
          </Link>
        );
      })}
    </Panel>
  );
}
