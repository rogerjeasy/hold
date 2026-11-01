import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';

// How many claims and holds wait on a person. The phone only counts them: each is decided on the web, where a passkey
// confirms who decided, so nothing here can charge anyone.
export function DecisionsCard({ waiting }: { waiting: number }) {
  const t = useTranslations('shop.today.decisions');
  const { color } = useTheme();
  return (
    <View accessible className={`gap-2 p-4 ${waiting > 0 ? 'bg-contrast' : 'border border-border bg-card'}`}>
      <View className="flex-row items-center gap-2">
        <Icon name="web" color={waiting > 0 ? color.contrastForeground : color.mutedForeground} size={20} />
        <Text variant="heading" tone={waiting > 0 ? 'onContrast' : 'default'} className="shrink">
          {t('title', { count: waiting })}
        </Text>
      </View>
      <Text variant="small" tone={waiting > 0 ? 'onContrast' : 'muted'}>
        {waiting > 0 ? t('body') : t('none')}
      </Text>
    </View>
  );
}
