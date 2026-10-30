'use client'
import type { ItemRepair } from '@hold/db'
import { REPAIR_LIMITS } from '@hold/domain'
import type { RepairOutcome } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Panel } from '@/components/ui/panel'
import { Textarea } from '@/components/ui/textarea'
import { ActionMessage } from '@/features/shop/action-message'
import { finishRepair } from './actions'

// What was done to each line, what it cost and an optional note. Closing seals the photographs.
export function FinishRepairForm({ repair, currency, photographsMissing }: { repair: ItemRepair; currency: string; photographsMissing: boolean }) {
  const t = useTranslations('repairs.page')
  const locale = useLocale()
  const costId = useId()
  const noteId = useId()
  const [result, finish, finishing] = useActionState(finishRepair, null)
  const [outcomes, setOutcomes] = useState<Readonly<Record<string, RepairOutcome>>>(() => Object.fromEntries(repair.lines.map((line) => [line.id, 'repaired'] as const)))
  // Each line's choice is a radio group of its own, outside the form so its name is not sent; the form sends the
  // lines and their outcomes as two lists in the same order, which the action's fixed schema reads.
  const choices = `${costId}-choices`
  return (
    <Panel title={t('outcomesTitle')}>
      <form action={finish} className="grid gap-5 px-4 py-4 md:px-5">
        <input type="hidden" name="repairId" value={repair.id} />
        <input type="hidden" name="locale" value={locale} />
        {repair.lines.map((line) => (
          <fieldset key={line.id} className="grid gap-2">
            <legend className="mb-2 font-semibold wrap-long-words">{line.description}</legend>
            <input type="hidden" name="lineId" value={line.id} />
            <input type="hidden" name="outcome" value={outcomes[line.id] ?? 'repaired'} />
            <div className="grid gap-2 sm:grid-cols-2">
              {(['repaired', 'left'] as const).map((outcome) => (
                <label key={outcome} className="relative flex min-h-12 cursor-pointer items-center gap-3 border border-border-strong bg-card px-3 has-[:checked]:border-foreground has-[:checked]:bg-muted has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                  {/* The whole choice is the control: an invisible radio over it, a dot drawn at the size of text. */}
                  <input type="radio" form={choices} name={`outcome-${line.id}`} value={outcome} checked={outcomes[line.id] === outcome} onChange={() => { setOutcomes((now) => ({ ...now, [line.id]: outcome })) }} className="peer absolute inset-0 size-full cursor-pointer opacity-0" />
                  <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full border-2 border-border-strong bg-card peer-checked:border-primary peer-checked:[&>span]:opacity-100"><span className="size-2.5 rounded-full bg-primary opacity-0" /></span>
                  <span className="font-semibold">{t(outcome)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <div className="grid gap-1">
          <Label htmlFor={costId}>{t('cost', { currency })}</Label>
          <Input id={costId} name="cost" inputMode="decimal" required maxLength={20} aria-describedby={`${costId}-hint`} className="sm:max-w-xs" />
          <p id={`${costId}-hint`} className="text-sm text-muted-foreground">{t('costHint')}</p>
        </div>
        <div className="grid gap-1">
          <Label htmlFor={noteId}>{t('note')}</Label>
          <Textarea id={noteId} name="note" maxLength={REPAIR_LIMITS.noteLength} />
        </div>
        {photographsMissing ? <p className="text-muted-foreground">{t('photosFirst')}</p> : null}
        <Button type="submit" disabled={finishing || photographsMissing} className="min-h-12 justify-self-stretch sm:justify-self-start">{t('submit')}</Button>
        <ActionMessage result={result} success={t('doneTitle')} results="repairs.results" />
      </form>
    </Panel>
  )
}
