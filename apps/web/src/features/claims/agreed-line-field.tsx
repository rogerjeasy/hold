'use client'
import type { ClaimWorkspace } from '@hold/db'
import { formatMoney, money } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type AgreedChoice = { readonly keep: boolean; readonly amount: string }

// One line the renter agreed during the rental (extensions.md section 10.4): staff keep it, lower it, or leave it out
// after seeing the item. The server refuses a raised amount whatever this field says.
export function AgreedLineField({ incident, currency, choice, raised, onChange }: { incident: ClaimWorkspace['agreedIncidents'][number]; currency: string; choice: AgreedChoice; raised: boolean; onChange: (choice: AgreedChoice) => void }) {
  const t = useTranslations('claim.agreed')
  const locale = useLocale()
  const agreed = formatMoney(money(incident.agreedCents ?? 0, currency), locale)
  const field = `agreed-${incident.id}`
  return (
    <fieldset className="grid min-w-0 gap-3 rounded-xl border border-success/30 bg-success/5 p-4">
      <legend className="px-1.5 text-sm font-semibold wrap-long-words">{incident.itemLabel}</legend>
      <blockquote className="min-w-0 border-l-2 border-success/50 pl-3 whitespace-pre-wrap text-pretty wrap-long-words">{incident.description}</blockquote>
      <label className="flex min-h-11 items-start gap-3">
        <input type="checkbox" className="mt-1 min-h-11 min-w-11 shrink-0 accent-primary" checked={choice.keep} onChange={(event) => { onChange({ ...choice, keep: event.target.checked }) }} />
        <span className="min-w-0 self-center wrap-long-words">{t('keep', { price: incident.priceDescription, amount: agreed })}</span>
      </label>
      {choice.keep ? (
        <div className="grid gap-1.5">
          <Label htmlFor={field}>{t('amount', { amount: agreed })}</Label>
          <Input id={field} inputMode="decimal" value={choice.amount} aria-invalid={raised} onChange={(event) => { onChange({ ...choice, amount: event.target.value }) }} className="figures sm:max-w-48" />
          {raised ? <p role="alert" className="text-destructive">{t('neverRaised')}</p> : null}
        </div>
      ) : null}
    </fieldset>
  )
}
