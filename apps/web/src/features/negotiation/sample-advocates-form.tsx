'use client'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { ActionMessage } from '@/features/shop/action-message'
import { argueSampleClaim } from './actions'

// Hands a sample claim that waits for its reply to the two advocates (extensions.md section 9). The made-up renter's
// contest and limit are fixed for the demonstration; both advocates are Claude, and the transcript appears below.
export function SampleAdvocatesForm({ rentalId }: { rentalId: string }) {
  const t = useTranslations('negotiation.sample')
  const locale = useLocale()
  const [result, argue, pending] = useActionState(argueSampleClaim, null)
  return (
    <form action={argue} className="grid gap-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="rentalId" value={rentalId} />
      <h3 className="text-lg font-semibold">{t('title')}</h3>
      <p className="max-w-prose text-muted-foreground">{t('body')}</p>
      <Button type="submit" disabled={pending || result?.ok === true} className="min-h-12 justify-self-start whitespace-normal">{pending ? t('pending') : t('start')}</Button>
      <ActionMessage result={result} success={t('started')} results="negotiation.results" />
    </form>
  )
}
