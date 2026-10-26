'use client'

import { LADDER_LIMITS, TRUST_HISTORIES } from '@hold/domain'
import { Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ActionMessage } from '@/features/shop/action-message'
import { publishLadder, replayLadder } from './actions'
import type { LadderDraft, RungDraft } from './ladder-draft'
import { RungFields } from './rung-fields'
import { SimulationResult } from './simulation-result'

const EMPTY_RUNG: RungDraft = { cleanReturns: '', share: '', largestValue: '', savedMethod: 'no' }

// Writes the next version of the shop's trust ladder, and replays it over past rentals before it is published. No
// amount a renter is held is typed here: holds are worked out from the ladder by plain code.
export function LadderEditor({ draft, currency }: { draft: LadderDraft; currency: string }) {
  const t = useTranslations('trust.ladder')
  const locale = useLocale()
  const [published, publish, publishing] = useActionState(publishLadder, null)
  const [replayed, replay, replaying] = useActionState(replayLadder, null)
  const [rungs, setRungs] = useState(() => draft.rungs.map((rung, key) => ({ ...rung, key })))
  const [nextKey, setNextKey] = useState(rungs.length)

  return (
    <form action={publish} className="grid gap-8">
      <input type="hidden" name="locale" value={locale} />
      <fieldset className="grid gap-3">
        <legend className="text-title">{t('history')}</legend>
        {TRUST_HISTORIES.map((history) => (
          <label key={history} className="flex min-h-11 items-start gap-3">
            <input type="radio" name="history" value={history} defaultChecked={draft.history === history} className="mt-1 size-5 shrink-0 accent-primary" />
            <span className="text-pretty">{history === 'own' ? t('historyOwn') : t('historyNetwork')}</span>
          </label>
        ))}
        <p className="max-w-prose text-sm text-muted-foreground">{t('historyHelp')}</p>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-3">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="windowMonths">{t('window')}</Label>
          <Input id="windowMonths" name="windowMonths" inputMode="numeric" defaultValue={draft.windowMonths} maxLength={2} required />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="minimumFee">{t('minimumFee', { currency })}</Label>
          <Input id="minimumFee" name="minimumFee" inputMode="decimal" defaultValue={draft.minimumFee} maxLength={20} aria-describedby="minimums-help" />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="minimumHours">{t('minimumHours')}</Label>
          <Input id="minimumHours" name="minimumHours" inputMode="numeric" defaultValue={draft.minimumHours} maxLength={3} aria-describedby="minimums-help" />
        </div>
        <p id="minimums-help" className="max-w-prose text-sm text-muted-foreground sm:col-span-3">
          {t('minimumsHelp')}
        </p>
      </div>

      <fieldset className="grid gap-4">
        <legend className="text-title">{t('rungs')}</legend>
        <p className="max-w-prose text-sm text-muted-foreground">{t('savedMethodNote')}</p>
        <ol className="grid gap-4">
          {rungs.map((rung, index) => (
            <RungFields
              key={rung.key}
              rung={rung}
              number={index + 1}
              idPrefix={`rung-${String(rung.key)}`}
              currency={currency}
              onRemove={() => {
                setRungs((current) => current.filter((candidate) => candidate.key !== rung.key))
              }}
            />
          ))}
        </ol>
        <Button
          type="button"
          variant="outline"
          disabled={rungs.length >= LADDER_LIMITS.rungs}
          onClick={() => {
            setRungs((current) => [...current, { ...EMPTY_RUNG, key: nextKey }])
            setNextKey((key) => key + 1)
          }}
          className="justify-self-start"
        >
          <Plus aria-hidden="true" />
          {t('add')}
        </Button>
      </fieldset>

      <div className="grid gap-3">
        <div className="flex flex-wrap gap-3">
          <Button type="submit" formAction={replay} variant="outline" disabled={replaying}>
            {replaying ? t('simulating') : t('simulate')}
          </Button>
          <Button type="submit" disabled={publishing}>
            {publishing ? t('publishing') : t('publish')}
          </Button>
        </div>
        {replayed?.ok === true ? <SimulationResult replay={replayed.value} currency={currency} /> : <ActionMessage result={replayed} success="" results="trust.ladder.results" />}
        <p className="text-sm text-muted-foreground">{t('publishHelp')}</p>
        <ActionMessage result={published} success={t('published')} results="trust.ladder.results" />
      </div>
    </form>
  )
}
