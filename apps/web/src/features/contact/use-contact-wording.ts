'use client'
import { useTranslations } from 'next-intl'

const REASONS = ['phone_invalid', 'country_not_texted', 'code_needed', 'code_recently_sent', 'code_expired', 'wrong_code', 'text_unavailable', 'email_unavailable', 'payer_missing'] as const

// The words for each reason a request about texts was refused.
export function useContactWording(): Readonly<Record<string, string>> {
  const t = useTranslations('contact.results')
  return Object.fromEntries(REASONS.map((reason) => [reason, t(reason)]))
}
