import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTranslations } from 'use-intl';
import { iconNames } from '@/components/ui';
import { useTheme } from '@/theme';

// The counter's tabs: the platform's own tab bar, with SF Symbols on iOS and Material icons on Android. Each tab is a
// stack of its own, for its large title and the account button.
export default function ShopTabs() {
  const t = useTranslations('shop.tabs');
  const { color } = useTheme();
  const tab = (name: 'today' | 'rentals' | 'dropOffs') => ({ sf: iconNames(name).ios, md: iconNames(name).android });
  return (
    <NativeTabs tintColor={color.primary}>
      <NativeTabs.Trigger name="(today)">
        <NativeTabs.Trigger.Icon {...tab('today')} />
        <NativeTabs.Trigger.Label>{t('today')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="rentals">
        <NativeTabs.Trigger.Icon {...tab('rentals')} />
        <NativeTabs.Trigger.Label>{t('rentals')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="drop-offs">
        <NativeTabs.Trigger.Icon {...tab('dropOffs')} />
        <NativeTabs.Trigger.Label>{t('dropOffs')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
