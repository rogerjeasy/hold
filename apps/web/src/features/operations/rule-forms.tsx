'use client'

import { amountText, money } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useId } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ActionMessage } from '@/features/shop/action-message'
import { confirmRule, discardRule } from './actions'

type ConfirmRuleFormProps = { ruleId: string; currency: string | null; suggestedCents: number | null }

// The owner confirms a drafted rule as "never", or as "only below an amount", which starts from the amount of the
// proposal it was drafted from.
export function ConfirmRuleForm({ ruleId, currency, suggestedCents }: ConfirmRuleFormProps) {
  const t = useTranslations('operations.rules')
  const locale = useLocale()
  const amountId = useId()
  const [result, confirm, pending] = useActionState(confirmRule, null)
  const suggested = currency === null || suggestedCents === null ? '' : amountText(money(suggestedCents, currency))
  return (
    <form action={confirm} className="grid gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="ruleId" value={ruleId} />
      <fieldset className="grid gap-1">
        <legend className="text-sm text-muted-foreground">{t('shape')}</legend>
        <label className="flex min-h-11 items-center gap-3">
          <input type="radio" name="shape" value="never" defaultChecked className="min-h-11 min-w-11 shrink-0 accent-primary" />
          {t('shapeNever')}
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input type="radio" name="shape" value="below_amount" className="min-h-11 min-w-11 shrink-0 accent-primary" />
          {t('shapeBelow')}
        </label>
      </fieldset>
      {currency === null ? <input type="hidden" name="amount" value="" /> : (
        <div className="grid max-w-60 gap-1">
          <Label htmlFor={amountId}>{t('amount', { currency })}</Label>
          <Input id={amountId} name="amount" inputMode="decimal" defaultValue={suggested} maxLength={20} />
        </div>
      )}
      <Button type="submit" disabled={pending} className="justify-self-start whitespace-normal">{t('confirm')}</Button>
      <ActionMessage result={result} success={t('confirmedDone')} results="operations.results" />
    </form>
  )
}

export function DiscardRuleForm({ ruleId }: { ruleId: string }) {
  const t = useTranslations('operations.rules')
  const locale = useLocale()
  const [result, discard, pending] = useActionState(discardRule, null)
  return (
    <form action={discard} className="grid gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="ruleId" value={ruleId} />
      <Button type="submit" variant="outline" disabled={pending} className="justify-self-start">{t('discard')}</Button>
      <ActionMessage result={result} success={t('discardedDone')} results="operations.results" />
    </form>
  )
}
