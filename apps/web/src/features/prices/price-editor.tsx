'use client'

import type { PriceListVersion } from '@hold/db'
import { checkPriceRows, PRICE_CATEGORIES, SHOP_CURRENCIES } from '@hold/domain'
import type { PriceCategory } from '@hold/domain'
import { Lock, Plus, Redo2, Send, Undo2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { StatusPill } from '@/components/ui/status-pill'
import { Textarea } from '@/components/ui/textarea'
import type { Locale } from '@/i18n/routing'
import { ActionMessage } from '@/features/shop/action-message'
import { publishPrices } from '@/features/shop/actions'
import { addRow, appendRows, draftEntries, insertRow, moveRow, pasteAt, removeRow, updateRow } from './editor-model'
import type { Draft, EditorRow, PasteTarget } from './editor-model'
import { parsePastedPrices } from './paste'
import { PastePanel } from './paste-panel'
import { PriceCards } from './price-cards'
import { PriceGrid } from './price-grid'
import { TermsPreview } from './terms-preview'
import type { TermsMessages } from './terms-preview'
import { useDraft } from './use-draft'
import { VersionsPanel } from './versions-panel'

export type PriceEditorProps = {
  shopId: string
  // The version in force, or none before the first is published.
  baseVersion: number | null
  published: Draft
  // Set once the first version is published. Earlier rentals were agreed in it, so it stays.
  fixedCurrency: string | null
  threshold: string
  versions: readonly PriceListVersion[]
  previewTerms: Readonly<Record<Locale, TermsMessages>>
}

// The next version of the shop's terms as a draft: a grid on a wide screen and cards on a phone, a paste from a
// spreadsheet, every change one step of an undo history, each cell checked by publishing's own rules, the draft as a
// renter reads it, and what it changes against any version. Publishing is the existing server function's.
export function PriceEditor({ shopId, baseVersion, published, fixedCurrency, threshold, versions, previewTerms }: PriceEditorProps) {
  const t = useTranslations('shop.prices')
  const editor = useTranslations('shop.priceEditor')
  const categories = useTranslations('shop.prices.categories')
  const locale = useLocale()
  const [result, publish, pending] = useActionState(publishPrices, null)
  const { draft, change, undo, redo, canUndo, canRedo, restored, discard } = useDraft(shopId, baseVersion, published)
  const [currency, setCurrency] = useState(fixedCurrency ?? 'EUR')
  const [wearText, setWearText] = useState(draft.wearPolicy)
  const [pasteMessage, setPasteMessage] = useState<string | null>(null)
  useEffect(() => { setWearText(draft.wearPolicy) }, [draft.wearPolicy])

  const cellProblems = useMemo(() => checkPriceRows(draft.rows, currency), [draft.rows, currency])
  const problems = useMemo(() => new Map(draft.rows.map((row, index) => [row.key, cellProblems[index] ?? {}])), [draft.rows, cellProblems])
  const cellsToFix = cellProblems.reduce((sum, each) => sum + Object.keys(each).length, 0) + (wearText.trim() === '' ? 1 : 0)
  const entries = useMemo(() => draftEntries(draft, currency), [draft, currency])
  const localKinds = useMemo(() => Object.fromEntries(PRICE_CATEGORIES.map((category) => [categories(category), category])) as Record<string, PriceCategory>, [categories])

  const onChange = useCallback((key: number, patch: Partial<Omit<EditorRow, 'key'>>) => { change(updateRow(draft, key, patch)) }, [change, draft])
  const onRemove = useCallback((key: number) => { change(removeRow(draft, key)) }, [change, draft])
  const onMove = useCallback((key: number, toIndex: number) => { change(moveRow(draft, key, toIndex)) }, [change, draft])
  const onPaste = useCallback((text: string) => {
    const pasted = parsePastedPrices(text, currency, localKinds)
    if (pasted.rows.length === 0) { setPasteMessage(editor('paste.none')); return }
    change(appendRows(draft, pasted.rows))
    setPasteMessage(editor('paste.added', { count: pasted.rows.length, skipped: pasted.skipped }))
  }, [change, draft, currency, localKinds, editor])
  const onInsert = useCallback((atIndex: number) => { change(insertRow(draft, atIndex)) }, [change, draft])
  const onPasteCells = useCallback((target: PasteTarget, cells: readonly (readonly string[])[]) => {
    const pasted = pasteAt(draft, target, cells, currency, localKinds)
    if (pasted.count === 0) { setPasteMessage(editor('paste.none')); return }
    change(pasted.draft)
    setPasteMessage(editor('paste.pasted', { count: pasted.count }))
  }, [change, draft, currency, localKinds, editor])
  useEffect(() => { if (result?.ok === true) discard() }, [result, discard])

  return (
    <div className="grid min-w-0 gap-8">
      <form action={publish} className="grid min-w-0 gap-6">
        <input type="hidden" name="locale" value={locale} />
        {draft.rows.map((row) => (
          <span key={row.key} hidden>
            <input type="hidden" name="description" value={row.description} />
            <input type="hidden" name="category" value={row.category} />
            <input type="hidden" name="amount" value={row.amount.trim()} />
          </span>
        ))}
        <div className="surface grid gap-5 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:p-5">
          <div className="grid content-start gap-1.5">
            <Label htmlFor="currency">{t('currency')}</Label>
            {fixedCurrency === null ? (
              <Select id="currency" name="currency" value={currency} onChange={(event) => { setCurrency(event.target.value) }}>
                {SHOP_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
              </Select>
            ) : (
              <>
                <input type="hidden" name="currency" value={fixedCurrency} />
                <p id="currency" className="figures flex min-h-12 items-center gap-2 text-lg font-semibold">
                  <Lock aria-hidden="true" className="size-4 text-muted-foreground" />
                  {fixedCurrency}
                </p>
              </>
            )}
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor="threshold">{t('threshold', { currency })}</Label>
            <Input id="threshold" name="threshold" inputMode="decimal" defaultValue={threshold} maxLength={20} className="figures max-w-60" aria-describedby="threshold-help" />
            <p id="threshold-help" className="text-sm text-muted-foreground">{t('thresholdHelp')}</p>
          </div>
        </div>

        <div className="grid min-w-0 gap-6 min-[1400px]:grid-cols-[minmax(0,5fr)_minmax(18rem,2fr)] min-[1400px]:items-start">
          <div className="grid min-w-0 gap-6">
            {/* On a phone the prices are cards of their own, so the editor around them is not a card too. */}
            <section aria-labelledby="draft-title" className="grid min-w-0 gap-4 md:surface md:gap-0 md:overflow-clip">
              <div className="grid gap-3 md:border-b md:border-border/70 md:px-5 md:py-4">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <h2 id="draft-title" className="text-[1.375rem] leading-tight font-extrabold tracking-tight">{editor('draftOf', { version: (baseVersion ?? 0) + 1 })}</h2>
                  <p data-testid="draft-status"><StatusPill tone={cellsToFix === 0 ? 'success' : 'danger'}>{editor('problems', { count: cellsToFix })}</StatusPill></p>
                </div>
                {restored ? <p role="status" className="rounded-xl bg-primary/8 px-3.5 py-2.5 text-sm">{editor('restored')}</p> : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="soft" onClick={() => { change(addRow(draft)) }}><Plus aria-hidden="true" />{t('add')}</Button>
                  <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-border sm:block" />
                  <Button type="button" variant="ghost" disabled={!canUndo} onClick={undo}><Undo2 aria-hidden="true" />{editor('undo')}</Button>
                  <Button type="button" variant="ghost" disabled={!canRedo} onClick={redo}><Redo2 aria-hidden="true" />{editor('redo')}</Button>
                  {canUndo || restored ? <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={discard}>{editor('discard')}</Button> : null}
                </div>
                <PastePanel onPaste={onPaste} message={pasteMessage} />
              </div>
              <div className="hidden min-w-0 md:block">
                <PriceGrid rows={draft.rows} currency={currency} problems={problems} onChange={onChange} onRemove={onRemove} onMove={onMove} onInsert={onInsert} onPasteCells={onPasteCells} onUndo={undo} onRedo={redo} />
                <p className="border-t border-border/70 px-5 py-3 text-sm text-muted-foreground">{editor('grid.keys')}</p>
              </div>
              <div className="md:hidden">
                <PriceCards rows={draft.rows} currency={currency} problems={problems} onChange={onChange} onRemove={onRemove} />
              </div>
            </section>
            <div className="surface grid gap-2 p-4 md:p-5">
              <Label htmlFor="wearPolicy" className="text-[1.0625rem] leading-tight font-extrabold tracking-tight">{t('wear')}</Label>
              <p className="text-sm text-muted-foreground">{t('wearHelp')}</p>
              <Textarea id="wearPolicy" name="wearPolicy" value={wearText} maxLength={4000} required className="mt-1 min-h-28" onChange={(event) => { setWearText(event.target.value) }} onBlur={() => { if (wearText !== draft.wearPolicy) change({ ...draft, wearPolicy: wearText }) }} />
            </div>
          </div>
          <div className="min-w-0 min-[1400px]:sticky min-[1400px]:top-6">
            <TermsPreview currency={currency} prices={entries} wearPolicy={wearText} terms={previewTerms} />
          </div>
        </div>

        {/* Publishing stays in reach while the draft scrolls under it, from a tablet up; a phone keeps its screen for the draft. */}
        <div className="glass z-10 md:sticky md:bottom-[calc(var(--shop-bottom-inset,0px)+1rem)] flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border p-2.5 shadow-raised">
          <Button type="submit" disabled={pending || cellsToFix > 0} className="min-h-12">
            <Send aria-hidden="true" />
            {pending ? t('publishing') : t('publish')}
          </Button>
          <p className="min-w-0 flex-[1_1_14rem] text-sm text-muted-foreground">{t('publishHelp')}</p>
          <ActionMessage result={result} success={t('published')} />
        </div>
      </form>
      <VersionsPanel versions={versions} currency={currency} draft={{ entries, wearPolicy: wearText }} />
    </div>
  )
}
