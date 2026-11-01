import { useTranslations } from 'use-intl';
import { Notice } from '@/components/ui';
import type { ActionFailed } from '@/features/renter-common';

// Why something a renter asked for did not happen, in plain words, and that nothing was charged. Hold's refusal says
// why by its reason, which the web words the same way; a request that never reached Hold says so. A screen may word a
// reason its own way, such as a declined hold rather than a declined payment.
export function RenterRefusal({ failed, wording = {} }: { failed: ActionFailed; wording?: Readonly<Record<string, string>> }) {
  const t = useTranslations();
  const results = useTranslations('rental.results');
  type Reason = Parameters<typeof results>[0];
  if (failed.failure !== 'refused') {
    return <Notice tone="destructive" announced title={t(`loadState.${failed.failure}.title`)} body={t(`loadState.${failed.failure}.body`)} />;
  }
  // A reason may carry a value after a colon, such as the latest end a hold covers; the words are the reason's.
  const reason = (failed.reason ?? 'paypal_unavailable').split(':')[0] ?? '';
  const body = wording[reason] ?? (results.has(reason as Reason) ? results(reason as Reason) : results('paypal_unavailable'));
  return <Notice tone="destructive" announced title={t('loadState.refused.title')} body={body} />;
}
