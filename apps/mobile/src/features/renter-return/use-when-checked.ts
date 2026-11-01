import { useTranslations } from 'use-intl';
import { useShopTime } from '@/features/renter-common';
import type { SelfReturn } from './return-screen';

// When a person will look, in the shop's own hours: today while it is open, at the next opening, or, with no hours
// given, when it next opens.
export function useWhenChecked(view: Pick<SelfReturn, 'shopName' | 'opening' | 'timeZone'>) {
  const t = useTranslations('selfReturn.when');
  const time = useShopTime(view.timeZone);
  if (view.opening === null) return t('unknown', { shop: view.shopName });
  return view.opening.open ? t('open', { shop: view.shopName }) : t('later', { shop: view.shopName, when: time.when(view.opening.opensAt) });
}
