'use client'

import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import { CheckBox } from '@/components/ui/check-box'
import { SampleTag } from '@/components/ui/sample-tag'
import type { BoardRow } from './board'
import { DecisionDetail } from './decision-detail'
import type { RowText } from './use-row-text'

type CardProps = {
  row: BoardRow
  text: RowText
  photoUrls: Readonly<Record<string, string>>
  passkeyNeeded: boolean
  chosen: boolean
  onToggleChosen: (id: string, chosen: boolean) => void
}

// One decision on a phone: what it is, when, how much and who decides, with its evidence and actions one tap away.
// The evidence is drawn only once opened, so a phone loads no photograph it was not asked for.
function DecisionCard({ row, text, photoUrls, passkeyNeeded, chosen, onToggleChosen }: CardProps) {
  const t = useTranslations('decisions')
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const panelId = useId()
  return (
    <article data-row={row.id} aria-labelledby={titleId} className="@container grid min-w-0 gap-3 border bg-card p-4 text-card-foreground">
      <div className="flex items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 id={titleId} className="font-bold leading-snug text-pretty wrap-long-words">{text.heading(row)}</h2>
            {row.simulated ? <SampleTag /> : null}
          </div>
          <p className="text-sm text-muted-foreground wrap-long-words">{text.subject(row)}</p>
        </div>
        {row.selectable ? <CheckBox label={text.choose(row)} hideLabel checked={chosen} onChange={(on) => { onToggleChosen(row.id, on) }} /> : null}
      </div>
      <p className={row.overdue ? 'text-sm font-semibold text-destructive' : 'text-sm'}>
        {text.due(row)}
        {row.amountCents === null ? null : <span className="figures text-foreground"> · {text.money(row.amountCents)}</span>}
      </p>
      <p className={row.decider === 'you' ? 'text-sm font-semibold' : 'text-sm text-muted-foreground'}>{text.deciderLine(row)}</p>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => { setOpen(!open) }}
        className="inline-flex min-h-11 items-center gap-2 justify-self-start font-semibold underline underline-offset-4"
      >
        {t('open')}
        <ChevronDown aria-hidden="true" className={open ? 'size-4 rotate-180' : 'size-4'} />
      </button>
      <div id={panelId} hidden={!open} className="border-t pt-4">
        {open ? <DecisionDetail row={row} text={text} photoUrls={photoUrls} passkeyNeeded={passkeyNeeded} /> : null}
      </div>
    </article>
  )
}

type DecisionCardsProps = Omit<CardProps, 'row' | 'chosen'> & { rows: readonly BoardRow[]; selectedIds: ReadonlySet<string> }

// The board below the medium width: a list of cards in the same order as the grid, holding the same rows.
export function DecisionCards({ rows, selectedIds, ...card }: DecisionCardsProps) {
  const t = useTranslations('decisions')
  return (
    <ul aria-label={t('list')} className="grid gap-3">
      {rows.map((row) => (
        <li key={row.id} className="min-w-0">
          <DecisionCard row={row} chosen={selectedIds.has(row.id)} {...card} />
        </li>
      ))}
    </ul>
  )
}
