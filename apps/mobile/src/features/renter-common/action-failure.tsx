import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import type { ActionFailed } from './use-renter-action';

// Why Hold did not do what the renter asked, in plain words, read out as it appears. A screen may word a reason its
// own way (a wrong code on a claim, a reused photograph on a return). A reason with no words of its own says only
// that nothing was done, never a code.
export function ActionFailure({ failed, wording = {} }: { failed: ActionFailed | undefined; wording?: Readonly<Record<string, string>> }) {
  const message = useFailureWords(wording);
  const { color } = useTheme();
  if (failed === undefined) return null;
  return (
    <View role="alert" accessible accessibilityLiveRegion="polite" className="flex-row gap-2">
      <Icon name="error" color={color.destructive} size={18} />
      <Text tone="destructive" selectable className="min-w-0 flex-1">
        {message(failed)}
      </Text>
    </View>
  );
}

export function useFailureWords(wording: Readonly<Record<string, string>> = {}) {
  const t = useTranslations('renterAction.reasons');
  type Key = Parameters<typeof t>[0];
  return (failed: ActionFailed) => {
    const key = failed.failure === 'refused' ? (failed.reason ?? 'refused') : failed.failure;
    return wording[key] ?? (t.has(key as Key) ? t(key as Key) : t('refused'));
  };
}
