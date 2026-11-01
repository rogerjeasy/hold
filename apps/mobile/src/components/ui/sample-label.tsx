import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Text } from './text';

// Beside anything simulated for the demo, so a sample is never read as a real rental or a real payment
// (AGENTS.md section 9). The record says so too; this is what the screen shows.
export function SampleLabel({ kind = 'sample' }: { kind?: 'sample' | 'simulated' }) {
  const t = useTranslations('common');
  return (
    <View className="self-start border border-border-strong px-1.5 py-px">
      <Text variant="tag" tone="muted">
        {t(kind)}
      </Text>
    </View>
  );
}
