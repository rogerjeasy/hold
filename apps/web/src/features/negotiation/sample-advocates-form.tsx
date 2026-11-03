'use client'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { ActionMessage } from '@/features/shop/action-message'
import { argueSampleClaim } from './actions'
import type { SampleAdvocatesAllowance } from './limits'

// Hands a sample claim that waits for its reply to the two advocates (extensions.md section 9). The made-up renter's
// contest and limit are fixed for the demonstration; both advocates are Claude, and the transcript appears below.
// allowance: the live runs left today, read by the server for each view, so a reload says what a refusal said.
export function SampleAdvocatesForm({ rentalId, allowance }: { rentalId: string; allowance: SampleAdvocatesAllowance }) {
  const t = useTranslations('negotiation.sample')
  const results = useTranslations('negotiation.results')
  const locale = useLocale()
  const [result, argue, pending] = useActionState(argueSampleClaim, null)
  return (
    <form action={argue} className="grid gap-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="rentalId" value={rentalId} />
      <h3 className="text-lg font-semibold">{t('title')}</h3>
      <p className="max-w-prose text-muted-foreground">{t('body')}</p>
      {allowance.left === 0 ? <Notice title={t('noneTitle')} body={results(allowance.refusal ?? 'daily_cap')} /> : (
        <>
          <p className="text-sm text-muted-foreground">{t('left', { count: allowance.left })}</p>
          <Button type="submit" disabled={pending || result?.ok === true} className="max-sm:w-full sm:justify-self-start">{pending ? t('pending') : t('start')}</Button>
        </>
      )}
      <div aria-live="polite"><ActionMessage result={result} success={t('started')} results="negotiation.results" /></div>
    </form>
  )
}
