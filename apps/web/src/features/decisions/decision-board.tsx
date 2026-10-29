'use client'

import { useTranslations } from 'next-intl'
import { useActionState, useCallback, useEffect, useMemo, useState } from 'react'
import type { DetailHeading } from '@/components/grid/master-detail'
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

// The board itself: the filters, then the grid, each decision opening in place under its row, or a list of cards on a
// phone. One choice of rows and one choice of releases serve both.
export function DecisionBoard({ rows, clock, photoUrls, passkeyNeeded }: DecisionBoardProps) {
  const t = useTranslations('decisions')
  const operations = useTranslations('operations')
  const text = useRowText(clock)
  const [view, setView] = useState<BoardView>({ group: 'all', search: '', mineOnly: false })
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [result, approve, pending] = useActionState(approveProposals, null)

  const visible = useMemo(() => visibleRows(rows, view, text.searchText), [rows, view, text])
  const releases = rows.filter((row): row is ProposalRow => isRelease(row) && selected.has(row.id))
  const renderDetail = useCallback(
    (row: BoardRow, heading: DetailHeading) => <DecisionDetail row={row} text={text} photoUrls={photoUrls} passkeyNeeded={passkeyNeeded} heading={heading} />,
    [text, photoUrls, passkeyNeeded],
  )

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
          <div className="hidden min-w-0 gap-2 md:grid">
            <DecisionGrid rows={visible} text={text} grouped={view.group === 'all'} selectedIds={selected} onSelect={onSelect} renderDetail={renderDetail} />
            <p className="text-sm text-muted-foreground">{t('keys')}</p>
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
