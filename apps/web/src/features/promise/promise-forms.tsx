'use client'
import { DECISION_PROMISE } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useId } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ActionMessage } from '@/features/shop/action-message'
import { grantPromiseWaiver, revokePromiseWaiver, savePromiseDays } from './actions'

export function PromiseDaysForm({ days }: { days: number }) {
  const t = useTranslations('promise')
  const locale = useLocale()
  const id = useId()
  const [result, save, saving] = useActionState(savePromiseDays, null)
  return (
    <form action={save} className="grid gap-3">
      <input type="hidden" name="locale" value={locale} />
      <Label htmlFor={id}>{t('days')}</Label>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">{t('hint')}</p>
      <Input id={id} name="days" type="number" inputMode="numeric" min={DECISION_PROMISE.minDays} max={DECISION_PROMISE.maxDays} step={1} required defaultValue={days} aria-describedby={`${id}-hint`} className="sm:max-w-xs" />
      <Button type="submit" disabled={saving} className="min-h-12 justify-self-stretch sm:justify-self-start">{t('save')}</Button>
      <ActionMessage result={result} success={t('saved')} results="promise.results" />
    </form>
  )
}

// Turns the waiver rule on, or on again with new limits, which replaces the one in force.
export function GrantWaiverForm() {
  const t = useTranslations('promise.waiver')
  const locale = useLocale()
  const countId = useId()
  const daysId = useId()
  const [result, grant, pending] = useActionState(grantPromiseWaiver, null)
  return (
    <form action={grant} className="grid gap-3">
      <input type="hidden" name="locale" value={locale} />
      <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
        <div className="grid min-w-0 content-start gap-1">
          <Label htmlFor={countId}>{t('dailyCount')}</Label>
          <Input id={countId} name="dailyCount" type="number" inputMode="numeric" min={1} max={20} required defaultValue={5} />
        </div>
        <div className="grid min-w-0 content-start gap-1">
          <Label htmlFor={daysId}>{t('days')}</Label>
          <Input id={daysId} name="days" type="number" inputMode="numeric" min={1} max={90} required defaultValue={60} />
        </div>
      </div>
      <Button type="submit" disabled={pending} className="min-h-12 justify-self-stretch sm:justify-self-start">{t('grant')}</Button>
      <ActionMessage result={result} success={t('granted')} results="promise.results" />
    </form>
  )
}

export function RevokeWaiverForm() {
  const t = useTranslations('promise.waiver')
  const locale = useLocale()
  const [result, revoke, pending] = useActionState(revokePromiseWaiver, null)
  return (
    <form action={revoke} className="grid gap-2">
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant="outline" disabled={pending} className="min-h-12 justify-self-stretch sm:justify-self-start">{t('revoke')}</Button>
      <ActionMessage result={result} success={t('revoked')} results="promise.results" />
    </form>
  )
}
