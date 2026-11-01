import { useTranslations } from 'use-intl';

const CLAIM = ['code_expired', 'wrong_code', 'code_recently_sent', 'reply_expired', 'already_replied', 'reason_required', 'email_unavailable'] as const;
const ADVOCATE = ['amount_invalid', 'assistant_not_connected', 'not_found'] as const;

// The claim's refusals, in its own words: a code, a reply period, an advocate.
export function useClaimWording(): Readonly<Record<string, string>> {
  const t = useTranslations('claim.results');
  const advocate = useTranslations('negotiation.results');
  return { ...Object.fromEntries(ADVOCATE.map((key) => [key, advocate(key)])), ...Object.fromEntries(CLAIM.map((key) => [key, t(key)])) };
}
