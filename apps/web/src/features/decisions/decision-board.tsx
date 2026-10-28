'use client'

import { useTranslations } from 'next-intl'
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ShopClock } from '@/hooks/use-shop-format'
import { approveProposals } from '@/features/operations/actions'
import { ApprovalMessage } from '@/features/operations/approval-message'
import { groupCounts, visibleRows } from './board'
import type { BoardRow, BoardView, ProposalRow } from './board'
import { DecisionCards } from './decision-cards'
import { DecisionDetail } from './decision-detail'
import { DecisionGrid } from './decision-grid'
import { DecisionToolbar } from './decision-toolbar'
import { ReleaseBar } from './release-bar'
import { useRowText } from './use-row-text'

export type DecisionBoardProps = {
  rows: readonly BoardRow[]
  clock: ShopClock
  photoUrls: Readonly<Record<string, string>>
  passkeyNeeded: boolean
}

const isRelease = (row: BoardRow): row is ProposalRow => row.kind === 'proposal' && row.selectable

// The board itself: the filters, then the grid with the chosen decision beside it on a wide screen and below it on a
// tablet, or a list of cards on a phone. One choice of rows and one choice of releases serve both.
export function DecisionBoard({ rows, clock, photoUrls, passkeyNeeded }: DecisionBoardProps) {
  const t = useTranslations('decisions')
  const operations = useTranslations('operations')
  const text = useRowText(clock)
  const [view, setView] = useState<BoardView>({ group: 'all', search: '', mineOnly: false })
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [result, approve, pending] = useActionState(approveProposals, null)
  const heading = useRef<HTMLHeadingElement>(null)
  const [focusRequest, setFocusRequest] = useState(0)

  const visible = useMemo(() => visibleRows(rows, view, text.searchText), [rows, view, text])
  // The decision shown beside the grid: the one chosen, while it is shown, or else the first.
  const chosen = visible.find((row) => row.id === chosenId) ?? visible[0]
  const releases = rows.filter((row): row is ProposalRow => isRelease(row) && selected.has(row.id))

  const choose = useCallback((id: string, options?: { readonly open: boolean }) => {
    setChosenId(id)
    if (options?.open === true) setFocusRequest((request) => request + 1)
  }, [])
  useEffect(() => {
    if (focusRequest > 0) heading.current?.focus()
  }, [focusRequest])
  // Releases approved, or gone from the records since, leave the choice.
  useEffect(() => {
    if (result?.ok === true) setSelected(new Set())
  }, [result])
  const onSelect = useCallback((ids: readonly string[]) => { setSelected(new Set(ids)) }, [])
  const toggle = useCallback((id: string, on: boolean) => {
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])
  const clear = useCallback(() => { setSelected(new Set()) }, [])

  return (
    <div className="grid min-w-0 gap-6">
      <DecisionToolbar view={view} counts={groupCounts(rows)} onChange={setView} />
      <div aria-live="polite">
        <ApprovalMessage result={result} success={operations('approvedTogether')} />
      </div>
      {visible.length === 0 ? (
        <p className="text-muted-foreground">{t('noMatch')}</p>
      ) : (
        <>
          <div className="hidden min-w-0 gap-6 md:grid xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
            <div className="grid min-w-0 gap-2">
              <DecisionGrid rows={visible} text={text} chosenId={chosen?.id ?? null} selectedIds={selected} onChoose={choose} onSelect={onSelect} />
              <p className="text-sm text-muted-foreground">{t('keys')}</p>
            </div>
            <section aria-label={t('detail.label')} className="@container min-w-0 border bg-card p-5 text-card-foreground xl:sticky xl:top-6">
              {chosen === undefined ? (
                <p className="text-muted-foreground">{t('detail.none')}</p>
              ) : (
                <DecisionDetail key={chosen.id} row={chosen} text={text} photoUrls={photoUrls} passkeyNeeded={passkeyNeeded} heading={{ ref: heading }} />
              )}
            </section>
          </div>
          <div className="md:hidden">
            <DecisionCards rows={visible} text={text} photoUrls={photoUrls} passkeyNeeded={passkeyNeeded} selectedIds={selected} onToggleChosen={toggle} />
          </div>
        </>
      )}
      {releases.length === 0 ? null : <ReleaseBar releases={releases} text={text} passkeyNeeded={passkeyNeeded} approve={approve} pending={pending} onClear={clear} />}
    </div>
  )
}
