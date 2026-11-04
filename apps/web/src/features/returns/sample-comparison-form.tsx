'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { ActionMessage } from '@/features/shop/action-message'
import { compareSample } from './actions'
import type { SampleComparisonAllowance } from './limits'

// Starts the real comparison on the demo's sample return (architecture.md section 20.3). The page draws again from the
// server once the action answers, so a reload shows the comparison running, done, or still waiting after a refusal.
// allowance: the runs left today, read by the server for each view, so a reload says what a refusal said.
// standIn: on the in-process fakes a stand-in answers, so the run is called simulated, not real.
export function SampleComparisonForm({ rentalId, allowance, standIn }: { rentalId: string; allowance: SampleComparisonAllowance; standIn: boolean }) {
  const t = useTranslations('shop.comparison.sample')
  const results = useTranslations('shop.returns.results')
  const locale = useLocale()
  const [result, start, pending] = useActionState(compareSample, null)
  return (
    <form action={start} className="grid gap-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="rentalId" value={rentalId} />
      {allowance.left === 0 ? <Notice title={t('noneTitle')} body={results(allowance.refusal ?? 'daily_cap')} /> : (
        <>
          <p className="text-sm text-muted-foreground">{t(standIn ? 'standIn.left' : 'left', { count: allowance.left })}</p>
          <Button type="submit" disabled={pending || result?.ok === true} className="min-h-12 justify-self-start whitespace-normal">{pending ? t('starting') : t(standIn ? 'standIn.start' : 'start')}</Button>
        </>
      )}
      <div aria-live="polite"><ActionMessage result={result} success={t('started')} results="shop.returns.results" /></div>
    </form>
  )
}
