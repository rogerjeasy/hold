'use client'

import { PRICE_CATEGORIES } from '@hold/domain'
import type { PriceCellProblems } from '@hold/domain'
import { Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import type { EditorRow } from './editor-model'

type PriceCardsProps = {
  rows: readonly EditorRow[]
  currency: string
  problems: ReadonlyMap<number, PriceCellProblems>
  onChange: (key: number, change: Partial<Omit<EditorRow, 'key'>>) => void
  onRemove: (key: number) => void
}

// The draft on a phone: one card per price, the same rows as the grid. A field commits when it is left, so a word typed
// is one step of the undo history, not one per letter. A field is drawn again when the draft changes under it.
export function PriceCards({ rows, currency, problems, onChange, onRemove }: PriceCardsProps) {
  const t = useTranslations('shop.prices')
  const editor = useTranslations('shop.priceEditor')
  const categories = useTranslations('shop.prices.categories')
  return (
    <ol className="grid gap-3">
      {rows.map((row, index) => {
        const found = problems.get(row.key) ?? {}
        const id = (field: string) => `price-${field}-${String(row.key)}`
        return (
          <li key={row.key} className="grid gap-3 border bg-card p-4 text-card-foreground">
            <div className="grid gap-1.5">
              <Label htmlFor={id('description')}>{t('description', { number: index + 1 })}</Label>
              <Input key={`d-${row.description}`} id={id('description')} defaultValue={row.description} maxLength={200} aria-invalid={found.description !== undefined} onBlur={(event) => { if (event.target.value !== row.description) onChange(row.key, { description: event.target.value }) }} />
              {found.description === undefined ? null : <p className="text-sm font-semibold text-destructive">{editor(`problemsText.${found.description}`, { currency })}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor={id('category')}>{t('category')}</Label>
                <Select id={id('category')} value={row.category} onChange={(event) => { onChange(row.key, { category: PRICE_CATEGORIES.find((each) => each === event.target.value) ?? 'damage' }) }}>
                  {PRICE_CATEGORIES.map((category) => <option key={category} value={category}>{categories(category)}</option>)}
                </Select>
              </div>
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor={id('amount')}>{t('amount', { currency })}</Label>
                <Input key={`a-${row.amount}`} id={id('amount')} inputMode="decimal" defaultValue={row.amount} maxLength={40} aria-invalid={found.amount !== undefined} onBlur={(event) => { if (event.target.value !== row.amount) onChange(row.key, { amount: event.target.value }) }} />
              </div>
            </div>
            {found.amount === undefined ? null : <p className="text-sm font-semibold text-destructive">{editor(`problemsText.${found.amount}`, { currency })}</p>}
            <Button type="button" variant="ghost" className="min-h-11 justify-self-start" onClick={() => { onRemove(row.key) }}>
              <Trash2 aria-hidden="true" />
              {row.description.trim() === '' ? editor('removeUnnamed', { number: index + 1 }) : editor('remove', { description: row.description })}
            </Button>
          </li>
        )
      })}
    </ol>
  )
}
