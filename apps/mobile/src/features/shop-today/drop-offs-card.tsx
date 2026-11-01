import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslations } from 'use-intl';
import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';

// Returns renters left at the drop point that nobody has checked yet: one tap to the Drop-offs tab.
export function DropOffsCard({ count }: { count: number }) {
  const t = useTranslations('shop.today');
  const { color } = useTheme();
  const title = t('dropOffs', { count });
  return (
    <Pressable
      role="button"
      aria-label={`${title}. ${t('dropOffsAction')}`}
      onPress={() => router.navigate('/shop/drop-offs')}
      className="min-h-touch flex-row items-center gap-3 border border-l-4 border-border border-l-warning bg-card p-4 active:bg-accent"
    >
      <Icon name="dropOffs" color={color.warning} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="small" tone="muted">
          {t('dropOffsAction')}
        </Text>
      </View>
      <Icon name="forward" color={color.mutedForeground} size={18} />
    </Pressable>
  );
}
