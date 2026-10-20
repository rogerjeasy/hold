'use client'
import type { ClaimWorkspace } from '@hold/db'
import { formatMoney, money } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ActionMessage } from '@/features/shop/action-message'
import { prepareClaim } from './actions'

export function ClaimDraftForm({ data }: { data: ClaimWorkspace }) {
  const t = useTranslations('claim')
  const locale = useLocale()
  const [result, prepare, pending] = useActionState(prepareClaim, null)
  const [rows, setRows] = useState([{ priceEntryId: data.prices[0]?.id ?? '', reason: '' }])
  const [selected, setSelected] = useState<readonly string[]>([])
  const findings = data.possibleFindings.filter((finding) => finding.suggestedPriceEntryId !== null)
  const lines = [...selected.flatMap((id) => {
    const finding = findings.find((finding) => finding.id === id)
    return finding?.suggestedPriceEntryId == null ? [] : [{ priceEntryId: finding.suggestedPriceEntryId, findingId: id }]
  }), ...rows.filter((row) => row.reason.trim() !== '')]
  return <form action={prepare} className="grid gap-4">
    <input type="hidden" name="locale" value={locale} /><input type="hidden" name="rentalId" value={data.rentalId} /><input type="hidden" name="lines" value={JSON.stringify(lines)} />
    <p className="text-muted-foreground">{t('draftGuidance')}</p>
    {findings.map((finding) => <label key={finding.id} className="flex min-h-11 items-start gap-3"><input type="checkbox" className="mt-1 min-h-11 min-w-11" checked={selected.includes(finding.id)} onChange={(event) => { setSelected(event.target.checked ? [...selected, finding.id] : selected.filter((id) => id !== finding.id)) }} /><span className="min-w-0 self-center wrap-long-words">{finding.description}</span></label>)}
    {rows.map((row, index) => <fieldset key={index} className="grid min-w-0 gap-2 border p-3"><legend className="px-1 font-semibold">{t('manualLine', { number: index + 1 })}</legend>
      <Label htmlFor={`claim-price-${String(index)}`}>{t('priceEntry')}</Label><Select id={`claim-price-${String(index)}`} value={row.priceEntryId} onChange={(event) => { setRows(rows.map((each, position) => position === index ? { ...each, priceEntryId: event.target.value } : each)) }}>{data.prices.map((entry) => <option key={entry.id} value={entry.id}>{entry.description} · {formatMoney(money(entry.amountCents, data.currency), locale)}</option>)}</Select>
      <Label htmlFor={`claim-reason-${String(index)}`}>{t('lineReason')}</Label><Textarea id={`claim-reason-${String(index)}`} value={row.reason} maxLength={1000} onChange={(event) => { setRows(rows.map((each, position) => position === index ? { ...each, reason: event.target.value } : each)) }} />
    </fieldset>)}
    <Button type="button" variant="ghost" className="justify-self-start" disabled={rows.length >= 50} onClick={() => { setRows([...rows, { priceEntryId: data.prices[0]?.id ?? '', reason: '' }]) }}>{t('addLine')}</Button>
    <Button type="submit" disabled={pending || lines.length === 0} className="min-h-12 justify-self-start">{t('prepare')}</Button>
    <ActionMessage result={result} success={t('prepared')} results="claim.results" />
  </form>
}
