import { useTranslations } from 'use-intl';
import { TabStack } from '@/features/shop-session/tab-stack';

export default function RentalsLayout() {
  const t = useTranslations('shop.tabs');
  return <TabStack title={t('rentals')} />;
}
