'use client'

import type { CustomCellRendererProps } from 'ag-grid-react'
import { useTranslations } from 'next-intl'
import { BOARD_GROUPS } from './board'
import type { BoardGroup, BoardRow } from './board'
import { useGridState } from './decision-cells'

const isGroup = (key: unknown): key is BoardGroup => BOARD_GROUPS.some((group) => group === key)

// A group's heading across the board: the kind of decision, how many wait in it, and the total of their amounts, which
// the grid adds up.
export function DecisionGroupLabel({ node }: CustomCellRendererProps<BoardRow>) {
  const t = useTranslations('decisions')
  const { text } = useGridState()
  if (!isGroup(node.key)) return null
  // What the grid added up for the group, which AG Grid does not type.
  const aggregates: unknown = node.aggData
  const total = typeof aggregates === 'object' && aggregates !== null && 'amount' in aggregates ? aggregates.amount : undefined
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-3">
      <span className="font-semibold">{t(`groups.${node.key}`)}</span>
      <span className="figures text-sm text-muted-foreground">
        {t('groupCount', { count: node.allChildrenCount ?? 0 })}
        {typeof total === 'number' ? ` · ${t('groupTotal', { amount: text.money(total) })}` : null}
      </span>
    </span>
  )
}
