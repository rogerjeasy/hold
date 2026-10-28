'use client'

import { Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { CheckBox } from '@/components/ui/check-box'
import { Input } from '@/components/ui/input'
import type { BoardView, GroupFilter } from './board'

const FILTERS: readonly GroupFilter[] = ['all', 'claims', 'agent', 'incidents', 'counter']

type DecisionToolbarProps = {
  view: BoardView
  counts: Readonly<Record<GroupFilter, number>>
  onChange: (view: BoardView) => void
}

// Which decisions to show: a group, with how many each holds; a search; and only the viewer's own.
export function DecisionToolbar({ view, counts, onChange }: DecisionToolbarProps) {
  const t = useTranslations('decisions')
  return (
    <div role="group" aria-label={t('toolbar')} className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((group) => {
          const pressed = view.group === group
          return (
            <button
              key={group}
              type="button"
              aria-pressed={pressed}
              onClick={() => { onChange({ ...view, group }) }}
              className={
                pressed
                  ? 'inline-flex min-h-11 items-center gap-2 border border-foreground bg-foreground px-3.5 font-semibold text-background'
                  : 'inline-flex min-h-11 items-center gap-2 border border-border-strong px-3.5 font-semibold hover:bg-muted'
              }
            >
              {t(`groups.${group}`)}{' '}
              <span className="figures text-sm opacity-80">{counts[group]}</span>
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="relative w-full max-w-md min-w-0 sm:flex-1">
          <span className="sr-only">{t('search')}</span>
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={view.search} placeholder={t('searchHint')} onChange={(event) => { onChange({ ...view, search: event.target.value }) }} className="min-h-11 pl-9" />
        </label>
        <CheckBox label={t('mineOnly')} checked={view.mineOnly} onChange={(mineOnly) => { onChange({ ...view, mineOnly }) }} />
      </div>
    </div>
  )
}
