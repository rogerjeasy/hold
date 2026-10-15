'use client'

import { CircleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'

type Failed = { readonly ok: false; readonly failure: string; readonly reason?: string }

// Why a renter's request was refused, in plain words. Only refusals are shown; success moves the page on.
export function RenterMessage({ result }: { result: Failed | { readonly ok: true } | null }) {
  const t = useTranslations('renter.results')
  if (result === null || result.ok) return null
  const key = (result.failure === 'refused' ? (result.reason ?? 'paypal_unavailable') : result.failure) as Parameters<typeof t>[0]
  return (
    <p role="alert" className="flex gap-1.5 text-[0.9375rem] text-destructive">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
      {t.has(key) ? t(key) : t('paypal_unavailable')}
    </p>
  )
}
