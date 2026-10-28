'use client'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RenterMessage } from '@/features/renter/renter-message'
import { AdvocateChoice } from './advocate-choice'
import { useResultWording } from './use-result-wording'
import { startAdvocate } from './renter-actions'

// The third choice on the renter's claim screen (extensions.md section 9.4): hand the contest to an advocate, with the
// most they will pay, after the same one-time code as accepting or contesting. The final tap stays on.
export function AdvocateForm({ token, currency, assistantName = null }: { token: string; currency: string; assistantName?: string | null }) {
  const t = useTranslations('negotiation.advocate')
  const locale = useLocale()
  const wording = useResultWording()
  const [result, start, pending] = useActionState(startAdvocate, null)
  return (
    <form action={start} className="grid gap-3 border-t pt-6">
      <h3 className="text-lg font-semibold">{t('title')}</h3>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      <p className="text-muted-foreground">{t('guidance')}</p>
      {assistantName === null ? null : <AdvocateChoice assistantName={assistantName} />}
      <Label htmlFor="advocate-code">{t('code')}</Label>
      <Input id="advocate-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" required minLength={8} maxLength={8} />
      <Label htmlFor="advocate-highest">{t('highest', { currency })}</Label>
      <Input id="advocate-highest" name="highest" inputMode="decimal" required maxLength={12} className="sm:max-w-xs" />
      <p>{t('sentence')}</p>
      <Label htmlFor="advocate-comment">{t('comment')}</Label>
      <Textarea id="advocate-comment" name="comment" maxLength={1000} />
      <Button type="submit" disabled={pending} className="min-h-12 justify-self-start whitespace-normal">{t('start')}</Button>
      {result?.ok === true ? <p role="status">{t('started')}</p> : null}
      <RenterMessage result={result} wording={wording} />
    </form>
  )
}
