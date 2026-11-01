import { useTranslations } from 'use-intl';
import { useShopTime } from '@/features/renter-common';

// Why more days cannot be had, with what the renter needs to act on it: the latest end the hold covers, when the item
// is needed next, or the most days the shop allows. Hold sends the value after a colon ("not_free:<when>").
export function useExtendWording(timeZone: string, reason: string | undefined): Record<string, string> {
  const t = useTranslations('extend.refused');
  const format = useShopTime(timeZone);
  const [kind = '', value = ''] = (reason ?? '').split(/:(.*)/s);
  const plain = { not_later: t('not_later'), not_out: t('not_out'), off: t('off'), no_hold: t('no_hold'), quote_stale: t('quote_stale') };
  if (kind === 'beyond_hold' && value !== '') return { ...plain, beyond_hold: t('beyond_hold', { when: format.when(value) }) };
  if (kind === 'not_free' && value !== '') return { ...plain, not_free: t('not_free', { when: format.when(value) }) };
  if (kind === 'too_many_days' && value !== '') return { ...plain, too_many_days: t('too_many_days', { days: Number(value) }) };
  return plain;
}
