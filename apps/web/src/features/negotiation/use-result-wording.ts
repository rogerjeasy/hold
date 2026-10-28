'use client'
import { useTranslations } from 'next-intl'

const REASONS = ['amount_invalid', 'already_replied', 'invalid_limits', 'not_agreed', 'not_found', 'role_may_not_confirm', 'raised_the_claim', 'no_currency', 'code_expired', 'wrong_code', 'code_recently_sent', 'email_unavailable', 'link_invalid', 'assistant_not_connected'] as const

// The renter's refusals, in this feature's own words.
export function useResultWording(): Readonly<Record<string, string>> {
  const t = useTranslations('negotiation.results')
  return Object.fromEntries(REASONS.map((reason) => [reason, t(reason)]))
}
