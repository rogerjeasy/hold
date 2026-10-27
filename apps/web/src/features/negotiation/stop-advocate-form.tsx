'use client'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { RenterMessage } from '@/features/renter/renter-message'
import { stopAdvocate } from './renter-actions'
import { useResultWording } from './use-result-wording'

// The way to stop the agent acting for the renter (extensions.md section 3, rule 7). It charges nothing.
export function StopAdvocateForm({ token }: { token: string }) {
  const t = useTranslations('negotiation.stop')
  const locale = useLocale()
  const wording = useResultWording()
  const [result, stop, pending] = useActionState(stopAdvocate, null)
  return (
    <form action={stop} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      <h2 className="text-lg font-semibold">{t('title')}</h2>
      <p>{t('guidance')}</p>
      <Button type="submit" variant="outline" disabled={pending} className="min-h-12 justify-self-start whitespace-normal">{t('button')}</Button>
      {result?.ok === true ? <p role="status">{t('done')}</p> : null}
      <RenterMessage result={result} wording={wording} />
    </form>
  )
}
