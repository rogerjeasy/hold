'use client'
import { SETTLEMENT_LIMITS } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { ActionMessage } from '@/features/shop/action-message'
import { endSettlementLimits, saveSettlementLimits } from './actions'
import type { CurrentLimits } from './settlement-limits-screen'

// The owner's form for the shop advocate's limits, and the way to end it. Saving revokes the limits before and grants
// new ones, so a negotiation already running goes to the owner.
export function SettlementLimitsForm({ currency, current }: { currency: string; current: CurrentLimits | null }) {
  const t = useTranslations('negotiation.limits')
  const locale = useLocale()
  const [saved, save, saving] = useActionState(saveSettlementLimits, null)
  const [ended, end, ending] = useActionState(endSettlementLimits, null)
  return (
    <div className="grid gap-6">
      <form action={save} className="grid gap-5">
        <input type="hidden" name="locale" value={locale} />
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
          <div className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor="limits-share">{t('lowestShare')}</Label>
            <Input id="limits-share" name="lowestShare" type="number" min={0} max={100} step={1} required defaultValue={current?.lowestSharePercent ?? 70} className="figures" />
          </div>
          <div className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor="limits-largest">{t('largestClaim', { currency })}</Label>
            <Input id="limits-largest" name="largestClaim" inputMode="decimal" required maxLength={12} defaultValue={current === null ? '' : (current.largestClaimCents / 100).toFixed(2)} className="figures" />
          </div>
          <div className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor="limits-rounds">{t('rounds')}</Label>
            <Input id="limits-rounds" name="rounds" type="number" min={SETTLEMENT_LIMITS.minRounds} max={SETTLEMENT_LIMITS.maxRounds} step={1} required defaultValue={current?.rounds ?? SETTLEMENT_LIMITS.defaultRounds} className="figures" />
          </div>
          <div className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor="limits-days">{t('days')}</Label>
            <Input id="limits-days" name="days" type="number" min={1} max={366} step={1} required defaultValue={90} className="figures" />
          </div>
          <div className="grid min-w-0 content-start gap-1.5 sm:col-span-2">
            <Label htmlFor="limits-evidence">{t('evidenceRequired')}</Label>
            <Select id="limits-evidence" name="evidenceRequired" defaultValue={current?.evidenceRequired === false ? 'no' : 'yes'}>
              <option value="yes">{t('evidenceRequiredYes')}</option>
              <option value="no">{t('evidenceRequiredNo')}</option>
            </Select>
          </div>
        </div>
        <Button type="submit" disabled={saving} className="min-h-12 justify-self-start">{t('save')}</Button>
        <ActionMessage result={saved} success={t('saved')} results="negotiation.results" />
      </form>
      {current === null ? null : (
        <form action={end} className="grid gap-3 border-t border-border/70 pt-5">
          <input type="hidden" name="locale" value={locale} />
          <Button type="submit" variant="outline" disabled={ending} className="min-h-12 justify-self-start text-destructive hover:border-destructive/40 hover:text-destructive">{t('end')}</Button>
          <ActionMessage result={ended} success={t('endDone')} results="negotiation.results" />
        </form>
      )}
    </div>
  )
}
