'use client'

import { EVALUATION_GROUPS } from '@hold/domain'
import type { EvaluationGroup } from '@hold/domain'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DetailHeading } from '@/components/grid/master-detail'
import { Verdict } from './case-cells'
import { CaseDetail } from './case-detail'
import { CaseGrid } from './case-grid'
import type { CaseRow } from './case-rows'
import { verdictCounts } from './case-rows'

type Filter = 'all' | EvaluationGroup

// The pairs, filtered by group with each group's record: in a grid from md, each pair opening in place under its row;
// on a phone a list of pairs, the chosen one shown below it.
export function CaseExplorer({ rows }: { rows: readonly CaseRow[] }) {
  const t = useTranslations('openScorecard')
  const [filter, setFilter] = useState<Filter>('all')
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [focusRequest, setFocusRequest] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const groups = EVALUATION_GROUPS.filter((group) => rows.some((row) => row.group === group))
  const visible = useMemo(() => (filter === 'all' ? rows : rows.filter((row) => row.group === filter)), [rows, filter])
  const chosen = visible.find((row) => row.id === chosenId) ?? visible[0]

  // On a phone, the pair chosen from the list takes the focus below it.
  const choose = useCallback((id: string) => {
    setChosenId(id)
    setFocusRequest((request) => request + 1)
  }, [])
  const renderDetail = useCallback((row: CaseRow, opened: DetailHeading) => <CaseDetail row={row} headingRef={opened.ref} />, [])
  useEffect(() => {
    if (focusRequest > 0) heading.current?.focus()
  }, [focusRequest])

  const chip = (key: Filter, of: readonly CaseRow[]) => {
    const counts = verdictCounts(of)
    const pressed = filter === key
    return (
      <button
        key={key}
        type="button"
        aria-pressed={pressed}
        onClick={() => { setFilter(key) }}
        className={pressed ? 'grid min-h-11 content-center border border-foreground bg-foreground px-3.5 py-1.5 text-left text-background' : 'grid min-h-11 content-center border border-border-strong px-3.5 py-1.5 text-left hover:bg-muted'}
      >
        <span className="font-semibold">{t(`groups.${key}`)}</span>{' '}
        <span className="figures text-xs opacity-80">{t('groupRight', { pass: counts.pass, total: counts.total })}</span>
      </button>
    )
  }

  return (
    <div className="grid min-w-0 gap-6">
      <div role="group" aria-label={t('filters')} className="flex flex-wrap gap-2">
        {chip('all', rows)}
        {groups.map((group) => chip(group, rows.filter((row) => row.group === group)))}
      </div>
      <div className="hidden min-w-0 gap-2 md:grid">
        <CaseGrid rows={visible} grouped={filter === 'all'} renderDetail={renderDetail} />
        <p className="text-sm text-muted-foreground">{t('keys')}</p>
      </div>
      <div className="grid min-w-0 gap-6 md:hidden">
        <ul aria-label={t('list')} className="grid gap-2">
          {visible.map((row) => (
            <li key={row.id}>
              <button type="button" aria-current={row.id === chosen?.id ? 'true' : undefined} onClick={() => { choose(row.id) }} className="flex min-h-11 w-full items-center justify-between gap-3 border bg-card px-4 py-2.5 text-left aria-[current=true]:border-primary">
                <span className="grid min-w-0">
                  <span className="truncate font-mono text-sm font-semibold">{row.id}</span>
                  <span className="truncate text-sm text-muted-foreground">{t(`groups.${row.group}`)}</span>
                </span>
                <Verdict verdict={row.verdict} />
              </button>
            </li>
          ))}
        </ul>
        <section aria-label={t('detail.label')} className="@container min-w-0 border bg-card p-5 text-card-foreground">
          {chosen === undefined ? <p className="text-muted-foreground">{t('detail.none')}</p> : <CaseDetail key={chosen.id} row={chosen} headingRef={heading} />}
        </section>
      </div>
    </div>
  )
}
