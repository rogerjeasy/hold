import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { useTranslations } from 'use-intl';
import { Icon } from '@/components/ui';
import { useTheme } from '@/theme';

// In each tab's header: who is signed in, the demo's switch, and signing out.
export function AccountButton() {
  const t = useTranslations('shop.account');
  const { color } = useTheme();
  return (
    <Pressable role="button" aria-label={t('open')} onPress={() => router.push('/shop/account')} hitSlop={8} className="min-h-touch min-w-touch items-center justify-center active:opacity-60">
      <Icon name="person" color={color.foreground} size={24} />
    </Pressable>
  );
}
