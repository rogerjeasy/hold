'use client'

import { CalendarClock, ChevronDown, Lock, TriangleAlert, UserCheck } from 'lucide-react'
import { cn } from 'cn'
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
    <article data-row={row.id} aria-labelledby={titleId} className={cn('@container surface grid min-w-0 gap-3 p-4 transition-shadow duration-300', open && 'shadow-raised')}>
      <div className="flex items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 id={titleId} className="leading-snug font-bold text-pretty wrap-long-words">{text.heading(row)}</h2>
            {row.simulated ? <SampleTag /> : null}
          </div>
          <p className="text-sm text-muted-foreground wrap-long-words">{text.subject(row)}</p>
        </div>
        {row.selectable ? <CheckBox label={text.choose(row)} hideLabel checked={chosen} onChange={(on) => { onToggleChosen(row.id, on) }} /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <span className={row.overdue ? 'inline-flex min-w-0 items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 font-semibold text-destructive' : 'inline-flex min-w-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1'}>
          {row.overdue ? <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" /> : <CalendarClock aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />}
          <span className="min-w-0 wrap-long-words">{text.due(row)}</span>
        </span>
        {row.amountCents === null ? null : <span className="figures font-semibold text-foreground">{text.money(row.amountCents)}</span>}
      </div>
      <p className={row.decider === 'you' ? 'flex items-center gap-1.5 text-sm font-semibold text-primary' : 'flex items-center gap-1.5 text-sm text-muted-foreground'}>
        {row.decider === 'you' ? <UserCheck aria-hidden="true" className="size-4 shrink-0" /> : <Lock aria-hidden="true" className="size-4 shrink-0" />}
        {text.deciderLine(row)}
      </p>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => { setOpen(!open) }}
        className="inline-flex min-h-11 items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-3.5 font-semibold transition-colors hover:bg-muted"
      >
        {t('open')}
        <ChevronDown aria-hidden="true" className={open ? 'size-4 rotate-180 transition-transform duration-300 ease-spring' : 'size-4 transition-transform duration-300 ease-spring'} />
      </button>
      <div id={panelId} hidden={!open} className="animate-fade border-t border-border/70 pt-4">
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
    <ul aria-label={t('list')} className="grid stagger gap-3">
      {rows.map((row) => (
        <li key={row.id} className="min-w-0">
          <DecisionCard row={row} chosen={selectedIds.has(row.id)} {...card} />
        </li>
      ))}
    </ul>
  )
}
