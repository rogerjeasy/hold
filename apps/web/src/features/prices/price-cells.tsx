'use client'

import type { PriceCellProblems } from '@hold/domain'
import { money, parseAmount } from '@hold/domain'
import type { CustomCellRendererProps } from 'ag-grid-react'
import { TriangleAlert, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { createContext, useContext } from 'react'
import { formatMoney } from '@/lib/money'
import type { EditorRow } from './editor-model'

// What the cells need beyond their row: the shop's currency, each row's problems, and how to remove a row. ag-grid-react
// draws the cells inside the grid's React tree, so a change here reaches them without the grid redrawing a row.
export type PriceGridState = { readonly currency: string; readonly problems: ReadonlyMap<number, PriceCellProblems>; readonly onRemove: (key: number) => void }
export const PriceGridContext = createContext<PriceGridState | null>(null)

function useGridState(): PriceGridState {
  const state = useContext(PriceGridContext)
  if (state === null) throw new Error('A price cell is drawn outside its grid.')
  return state
}

type CellProps = CustomCellRendererProps<EditorRow>

// The problem a cell has, in words and with a sign, under its value: never colour alone.
function Problem({ text }: { text: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1 text-xs font-semibold text-destructive">
      <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">{text}</span>
    </span>
  )
}

export function DescriptionCell({ data }: CellProps) {
  const t = useTranslations('shop.priceEditor')
  const { currency, problems } = useGridState()
  if (data === undefined) return null
  const problem = problems.get(data.key)?.description
  return (
    <div className="grid h-full min-w-0 content-center leading-snug">
      <span className="truncate">{data.description}</span>
      {problem === undefined ? null : <Problem text={t(`problemsText.${problem}`, { currency })} />}
    </div>
  )
}

// The amount in the shop's currency, as a renter will read it, or as typed while it is not yet an amount.
export function AmountCell({ data }: CellProps) {
  const t = useTranslations('shop.priceEditor')
  const { currency, problems } = useGridState()
  const locale = useLocale()
  if (data === undefined) return null
  const amount = parseAmount(data.amount, currency)
  const problem = problems.get(data.key)?.amount
  return (
    <div className="grid h-full min-w-0 content-center justify-items-end leading-snug">
      <span className="figures truncate">{amount === undefined ? data.amount : formatMoney(money(amount.cents, currency), locale)}</span>
      {problem === undefined ? null : <Problem text={t(`problemsText.${problem}`, { currency })} />}
    </div>
  )
}

export function RemoveCell({ data, node }: CellProps) {
  const t = useTranslations('shop.priceEditor')
  const { onRemove } = useGridState()
  if (data === undefined) return null
  const label = data.description.trim() === '' ? t('removeUnnamed', { number: (node.rowIndex ?? 0) + 1 }) : t('remove', { description: data.description })
  return (
    <button type="button" aria-label={label} onClick={() => { onRemove(data.key) }} className="grid size-11 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground">
      <X aria-hidden="true" className="size-4" />
    </button>
  )
}
