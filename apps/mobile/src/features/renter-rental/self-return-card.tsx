import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslations } from 'use-intl';
import { Button, Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';

// With nobody at the counter, returning it alone comes first on the rental (architecture.md section 6.13).
export function SelfReturnCard({ token }: { token: string }) {
  const t = useTranslations('rental.selfReturn');
  const { color } = useTheme();
  return (
    <View className="gap-3 border-2 border-foreground bg-card p-4">
      <View className="flex-row gap-2">
        <Icon name="place" color={color.primary} size={22} />
        <Text variant="heading" role="heading" className="min-w-0 flex-1">
          {t('closedTitle')}
        </Text>
      </View>
      <Text>{t('body')}</Text>
      <Text variant="tag" tone="muted">
        {t('meta')}
      </Text>
      <Button label={t('start')} icon="forward" onPress={() => router.push(`/r/${token}/return`)} />
    </View>
  );
}
