'use client'

import { LADDER_LIMITS, TRUST_HISTORIES } from '@hold/domain'
import { History, ListOrdered, Plus, Send } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FormCard } from '@/components/ui/form-card'
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
    <form action={publish} className="grid min-w-0 gap-6">
      <input type="hidden" name="locale" value={locale} />
      <FormCard title={t('history')} help={t('historyHelp')} icon={History}>
        <div className="grid gap-2 sm:grid-cols-2">
          {TRUST_HISTORIES.map((history) => (
            <label key={history} className="relative flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-card py-1.5 pr-3.5 pl-1.5 transition-colors hover:border-border-strong has-checked:border-primary/50 has-checked:bg-primary/6">
              {/* The real radio lies, unseen, over the dot drawn for the eye: it takes the tap, the keyboard and assistive technology. */}
              <input type="radio" name="history" value={history} defaultChecked={draft.history === history} className="peer absolute top-1/2 left-1.5 size-11 -translate-y-1/2 cursor-pointer opacity-0" />
              <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-lg peer-checked:[&_[data-dot]]:scale-100 peer-checked:[&_[data-ring]]:border-primary peer-focus-visible:outline-2 peer-focus-visible:outline-ring">
                <span data-ring className="grid size-5 place-items-center rounded-full border-2 border-border-strong bg-card transition-colors">
                  <span data-dot className="size-2.5 scale-0 rounded-full bg-primary transition-transform duration-200 ease-spring" />
                </span>
              </span>
              <span className="text-pretty">{history === 'own' ? t('historyOwn') : t('historyNetwork')}</span>
            </label>
          ))}
        </div>
        <div className="grid gap-5 border-t border-border/70 pt-4 sm:grid-cols-3">
          <div className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor="windowMonths">{t('window')}</Label>
            <Input id="windowMonths" name="windowMonths" inputMode="numeric" className="figures" defaultValue={draft.windowMonths} maxLength={2} required />
          </div>
          <div className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor="minimumFee">{t('minimumFee', { currency })}</Label>
            <Input id="minimumFee" name="minimumFee" inputMode="decimal" className="figures" defaultValue={draft.minimumFee} maxLength={20} aria-describedby="minimums-help" />
          </div>
          <div className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor="minimumHours">{t('minimumHours')}</Label>
            <Input id="minimumHours" name="minimumHours" inputMode="numeric" className="figures" defaultValue={draft.minimumHours} maxLength={3} aria-describedby="minimums-help" />
          </div>
          <p id="minimums-help" className="max-w-prose text-sm text-muted-foreground sm:col-span-3">
            {t('minimumsHelp')}
          </p>
        </div>
      </FormCard>

      <FormCard title={t('rungs')} help={t('savedMethodNote')} icon={ListOrdered}>
        <ol className="grid gap-3">
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
          variant="soft"
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
      </FormCard>

      {replayed?.ok === true ? <SimulationResult replay={replayed.value} currency={currency} /> : null}

      <div className="glass z-10 grid gap-2 rounded-2xl border p-2.5 shadow-raised md:sticky md:bottom-[calc(var(--shop-bottom-inset,0px)+1rem)]">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" formAction={replay} variant="outline" disabled={replaying} className="min-h-12">
            {replaying ? t('simulating') : t('simulate')}
          </Button>
          <Button type="submit" disabled={publishing} className="min-h-12">
            <Send aria-hidden="true" />
            {publishing ? t('publishing') : t('publish')}
          </Button>
          <p className="min-w-0 flex-[1_1_14rem] px-1 text-sm text-muted-foreground">{t('publishHelp')}</p>
        </div>
        {replayed?.ok === true ? null : <ActionMessage result={replayed} success="" results="trust.ladder.results" />}
        <ActionMessage result={published} success={t('published')} results="trust.ladder.results" />
      </div>
    </form>
  )
}
