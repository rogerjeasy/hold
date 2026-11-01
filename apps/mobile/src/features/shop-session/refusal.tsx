import { useTranslations } from 'use-intl';
import type { Answer } from '@/api';
import { Notice } from '@/components/ui';

export type Refusal = Extract<Answer<unknown>, { ok: false }>;

// What to say when Hold did not do what the counter asked. A money decision, or a step the person's role may not
// take, is decided on the web: the phone says so plainly and never tries again. A refusal with a known reason says
// what that reason means; anything else uses the screen-wide words for the failure.
export function useRefusalText() {
  const t = useTranslations();
  return (refusal: Refusal): { title: string; body: string } => {
    if (refusal.failure === 'passkey_needed' || refusal.failure === 'role') return { title: t('shop.refusal.web.title'), body: t('shop.refusal.web.body') };
    const reason = `shop.refusal.reasons.${refusal.reason ?? ''}`;
    if (refusal.failure === 'refused' && refusal.reason !== undefined && t.has(reason as 'shop.refusal.reasons.not_found')) {
      return { title: t('loadState.refused.title'), body: t(reason as 'shop.refusal.reasons.not_found') };
    }
    return { title: t(`loadState.${refusal.failure}.title`), body: t(`loadState.${refusal.failure}.body`) };
  };
}

export function RefusalNotice({ refusal }: { refusal: Refusal }) {
  const text = useRefusalText()(refusal);
  return <Notice tone="warning" announced title={text.title} body={text.body} />;
}
