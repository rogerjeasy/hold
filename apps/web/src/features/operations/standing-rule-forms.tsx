'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useId } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ActionMessage } from '@/features/shop/action-message'
import { grantStandingRule, revokeStandingRule } from './actions'

// Turns the standing rule on, or on again with new limits, which replaces the one in force.
export function GrantStandingRuleForm({ dailyCount }: { dailyCount: number }) {
  const t = useTranslations('operations.standing')
  const locale = useLocale()
  const countId = useId()
  const daysId = useId()
  const [result, grant, pending] = useActionState(grantStandingRule, null)
  return (
    <form action={grant} className="grid gap-3">
      <input type="hidden" name="locale" value={locale} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid min-w-0 content-start gap-1">
          <Label htmlFor={countId}>{t('dailyCount')}</Label>
          <Input id={countId} name="dailyCount" type="number" inputMode="numeric" min={1} max={20} required defaultValue={dailyCount} />
        </div>
        <div className="grid min-w-0 content-start gap-1">
          <Label htmlFor={daysId}>{t('days')}</Label>
          <Input id={daysId} name="days" type="number" inputMode="numeric" min={1} max={90} required defaultValue={30} />
        </div>
      </div>
      <Button type="submit" disabled={pending} className="justify-self-start">{t('grant')}</Button>
      <ActionMessage result={result} success={t('granted')} results="operations.results" />
    </form>
  )
}

export function RevokeStandingRuleForm() {
  const t = useTranslations('operations.standing')
  const locale = useLocale()
  const [result, revoke, pending] = useActionState(revokeStandingRule, null)
  return (
    <form action={revoke} className="grid gap-2">
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant="outline" disabled={pending} className="justify-self-start">{t('revoke')}</Button>
      <ActionMessage result={result} success={t('revoked')} results="operations.results" />
    </form>
  )
}
