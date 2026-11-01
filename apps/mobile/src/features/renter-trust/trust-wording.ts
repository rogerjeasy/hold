import { useTranslations } from 'use-intl';

const REASONS = ['code_expired', 'wrong_code', 'code_recently_sent', 'email_unavailable', 'payer_missing', 'renter_unknown'] as const;

// The words for each reason a change to the Clean Record was refused.
export function useTrustWording(): Readonly<Record<string, string>> {
  const t = useTranslations('trust.results');
  return Object.fromEntries(REASONS.map((reason) => [reason, t(reason)]));
}

export const isCodeProblem = (reason: string | undefined) => reason === 'wrong_code' || reason === 'code_expired';
