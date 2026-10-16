'use client'

import { CircleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'

type Failed = { readonly ok: false; readonly failure: string; readonly reason?: string }

// Why a renter's request was refused, in plain words. Only refusals are shown; success moves the page on. A page may
// word a reason its own way, such as a declined hold rather than a declined payment.
export function RenterMessage({ result, wording = {} }: { result: Failed | { readonly ok: true } | null; wording?: Readonly<Record<string, string>> }) {
  const t = useTranslations('renter.results')
  if (result === null || result.ok) return null
  const key = (result.failure === 'refused' ? (result.reason ?? 'paypal_unavailable') : result.failure) as Parameters<typeof t>[0]
  const own = wording[key]
  return (
    <p role="alert" className="flex gap-1.5 text-[0.9375rem] text-destructive">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
      {own ?? (t.has(key) ? t(key) : t('paypal_unavailable'))}
    </p>
  )
}
