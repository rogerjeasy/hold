'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { ActionMessage } from '@/features/shop/action-message'
import { compareSample } from './actions'

// Starts the real comparison on the demo's sample return (architecture.md section 20.3). The page draws again from the
// server once the action answers, so a reload shows the comparison running, done, or still waiting after a refusal.
export function SampleComparisonForm({ rentalId }: { rentalId: string }) {
  const t = useTranslations('shop.comparison.sample')
  const locale = useLocale()
  const [result, start, pending] = useActionState(compareSample, null)
  return (
    <form action={start} className="grid gap-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="rentalId" value={rentalId} />
      <Button type="submit" disabled={pending || result?.ok === true} className="min-h-12 justify-self-start whitespace-normal">{pending ? t('starting') : t('start')}</Button>
      <ActionMessage result={result} success={t('started')} results="shop.returns.results" />
    </form>
  )
}
