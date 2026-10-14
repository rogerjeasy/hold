'use client'

import { PRICE_CATEGORIES, PRICE_LIST_LIMITS, SHOP_CURRENCIES } from '@hold/domain'
import type { PriceCategory } from '@hold/domain'
import { Plus, Trash2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ActionMessage } from './action-message'
import { publishPrices } from './actions'

export type EditorRow = { readonly description: string; readonly category: PriceCategory; readonly amount: string }

type PriceListEditorProps = {
  // Set once the first version is published. Earlier rentals were agreed in it, so it stays.
  fixedCurrency: string | null
  threshold: string
  wearPolicy: string
  rows: readonly EditorRow[]
}

const emptyRow: EditorRow = { description: '', category: 'damage', amount: '' }

// Writes the next version of the price list. Each row is one price, in the order renters will read them.
export function PriceListEditor({ fixedCurrency, threshold, wearPolicy, rows: initialRows }: PriceListEditorProps) {
  const t = useTranslations('shop.prices')
  const categories = useTranslations('shop.prices.categories')
  const locale = useLocale()
  const [result, publish, pending] = useActionState(publishPrices, null)
  const [rows, setRows] = useState(() => (initialRows.length === 0 ? [{ ...emptyRow, key: 0 }] : initialRows.map((row, key) => ({ ...row, key }))))
  const [nextKey, setNextKey] = useState(rows.length)
  const [currency, setCurrency] = useState(fixedCurrency ?? 'EUR')
  const listId = useId()

  return (
    <form action={publish} className="grid gap-8">
      <input type="hidden" name="locale" value={locale} />
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="currency">{t('currency')}</Label>
          {fixedCurrency === null ? (
            <Select id="currency" name="currency" value={currency} onChange={(event) => {
                setCurrency(event.target.value)
              }}>
              {SHOP_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          ) : (
            <>
              <input type="hidden" name="currency" value={fixedCurrency} />
              <p id="currency" className="flex min-h-12 items-center font-semibold">
                {fixedCurrency}
              </p>
            </>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="threshold">{t('threshold', { currency })}</Label>
          <Input id="threshold" name="threshold" inputMode="decimal" defaultValue={threshold} maxLength={20} aria-describedby="threshold-help" />
          <p id="threshold-help" className="text-sm text-muted-foreground">
            {t('thresholdHelp')}
          </p>
        </div>
      </div>

      <fieldset className="grid gap-4">
        <legend id={listId} className="text-title">
          {t('entries')}
        </legend>
        <ol className="grid gap-4">
          {rows.map((row, index) => (
            <li key={row.key} className="grid gap-3 border-b pb-4 sm:grid-cols-[minmax(0,1fr)_10rem_8rem_auto] sm:items-end">
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor={`description-${String(row.key)}`}>{t('description', { number: index + 1 })}</Label>
                <Input id={`description-${String(row.key)}`} name="description" defaultValue={row.description} maxLength={PRICE_LIST_LIMITS.description} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`category-${String(row.key)}`}>{t('category')}</Label>
                <Select id={`category-${String(row.key)}`} name="category" defaultValue={row.category}>
                  {PRICE_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {categories(category)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`amount-${String(row.key)}`}>{t('amount', { currency })}</Label>
                <Input id={`amount-${String(row.key)}`} name="amount" inputMode="decimal" defaultValue={row.amount} maxLength={20} required />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={rows.length === 1}
                onClick={() => {
                  setRows((current) => current.filter((candidate) => candidate.key !== row.key))
                }}
                aria-label={t('remove', { number: index + 1 })}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ol>
        <Button
          type="button"
          variant="outline"
          disabled={rows.length >= PRICE_LIST_LIMITS.entries}
          onClick={() => {
            setRows((current) => [...current, { ...emptyRow, key: nextKey }])
            setNextKey((key) => key + 1)
          }}
          className="min-h-11 justify-self-start"
        >
          <Plus aria-hidden="true" />
          {t('add')}
        </Button>
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="wearPolicy" className="text-title">
          {t('wear')}
        </Label>
        <p className="text-muted-foreground">{t('wearHelp')}</p>
        <Textarea id="wearPolicy" name="wearPolicy" defaultValue={wearPolicy} maxLength={PRICE_LIST_LIMITS.wearPolicy} required />
      </div>

      <div className="grid gap-3">
        <Button type="submit" disabled={pending} className="min-h-12 justify-self-start">
          {pending ? t('publishing') : t('publish')}
        </Button>
        <p className="text-sm text-muted-foreground">{t('publishHelp')}</p>
        <ActionMessage result={result} success={t('published')} />
      </div>
    </form>
  )
}
