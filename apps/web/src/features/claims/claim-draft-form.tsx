'use client'
import type { ClaimWorkspace } from '@hold/db'
import { amountText, formatMoney, money, parseAmount } from '@hold/domain'
import { Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SampleTag } from '@/components/ui/sample-tag'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ActionMessage } from '@/features/shop/action-message'
import { prepareClaim } from './actions'
import { AgreedLineField } from './agreed-line-field'
import type { AgreedChoice } from './agreed-line-field'

// leading: the return shows possible damage, so preparing the claim is the page's main action.
export function ClaimDraftForm({ data, leading = false }: { data: ClaimWorkspace; leading?: boolean }) {
  const t = useTranslations('claim')
  const locale = useLocale()
  const [result, prepare, pending] = useActionState(prepareClaim, null)
  const [rows, setRows] = useState([{ priceEntryId: data.prices[0]?.id ?? '', reason: '' }])
  const [selected, setSelected] = useState<readonly string[]>([])
  const [agreed, setAgreed] = useState<Readonly<Record<string, AgreedChoice>>>(Object.fromEntries(data.agreedIncidents.map((incident) => [incident.id, { keep: true, amount: amountText(money(incident.agreedCents ?? 0, data.currency)) }])))
  // A confirmed finding no agreed price matched is offered too: staff choose its price, and the line keeps its evidence.
  const findings = data.possibleFindings
  const [chosen, setChosen] = useState<Readonly<Record<string, string>>>({})
  const priceOf = (finding: (typeof findings)[number]) => finding.suggestedPriceEntryId ?? chosen[finding.id] ?? ''
  // A kept agreed line at its amount or lower. A raised or unreadable amount is never sent: the form waits for a fix.
  const kept = data.agreedIncidents.flatMap((incident) => {
    const choice = agreed[incident.id]
    if (choice?.keep !== true) return []
    const amount = parseAmount(choice.amount, data.currency)
    return [{ incidentId: incident.id, amountCents: amount?.cents ?? -1, raised: amount === undefined || amount.cents > (incident.agreedCents ?? 0) || amount.cents === 0 }]
  })
  const pricedFindings = selected.flatMap((id) => {
    const finding = findings.find((finding) => finding.id === id)
    return finding === undefined ? [] : [{ priceEntryId: priceOf(finding), findingId: id }]
  })
  // A chosen finding without its price is never sent: the form waits for one.
  const blocked = kept.some((line) => line.raised) || pricedFindings.some((line) => line.priceEntryId === '')
  const lines = [...kept.map(({ incidentId, amountCents }) => ({ incidentId, amountCents })), ...pricedFindings.filter((line) => line.priceEntryId !== ''), ...rows.filter((row) => row.reason.trim() !== '')]
  return <form action={prepare} className="grid gap-5">
    <input type="hidden" name="locale" value={locale} /><input type="hidden" name="rentalId" value={data.rentalId} /><input type="hidden" name="lines" value={JSON.stringify(lines)} />
    <p className="text-pretty text-muted-foreground">{t('draftGuidance')}</p>
    {data.agreedIncidents.map((incident) => {
      const choice = agreed[incident.id] ?? { keep: false, amount: '' }
      return <AgreedLineField key={incident.id} incident={incident} currency={data.currency} choice={choice} raised={kept.some((line) => line.incidentId === incident.id && line.raised)} onChange={(next) => { setAgreed({ ...agreed, [incident.id]: next }) }} />
    })}
    {findings.length === 0 ? null : <ul className="grid gap-2">{findings.map((finding) => <li key={finding.id}>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border/70 px-3 py-2 transition-colors duration-200 ease-swift has-checked:border-primary has-checked:bg-primary/6">
        <input type="checkbox" className="mt-1 min-h-11 min-w-11 shrink-0 accent-primary" checked={selected.includes(finding.id)} onChange={(event) => { setSelected(event.target.checked ? [...selected, finding.id] : selected.filter((id) => id !== finding.id)) }} />
        <span className="min-w-0 self-center text-pretty wrap-long-words">{finding.description}</span>{finding.simulated ? <>{' '}<span className="self-center"><SampleTag /></span></> : null}
      </label>
      {finding.suggestedPriceEntryId === null && selected.includes(finding.id) ? <div className="grid gap-1.5 px-3 pt-2"><Label htmlFor={`claim-finding-price-${finding.id}`}>{t('findingPrice')}</Label><Select id={`claim-finding-price-${finding.id}`} value={chosen[finding.id] ?? ''} onChange={(event) => { setChosen({ ...chosen, [finding.id]: event.target.value }) }}><option value="">{t('choosePrice')}</option>{data.prices.map((entry) => <option key={entry.id} value={entry.id}>{entry.description} · {formatMoney(money(entry.amountCents, data.currency), locale)}</option>)}</Select></div> : null}
    </li>)}</ul>}
    {rows.map((row, index) => <fieldset key={index} className="grid min-w-0 gap-3 rounded-xl border border-border/70 p-4"><legend className="px-1.5 text-sm font-semibold">{t('manualLine', { number: index + 1 })}</legend>
      <div className="grid gap-1.5"><Label htmlFor={`claim-price-${String(index)}`}>{t('priceEntry')}</Label><Select id={`claim-price-${String(index)}`} value={row.priceEntryId} onChange={(event) => { setRows(rows.map((each, position) => position === index ? { ...each, priceEntryId: event.target.value } : each)) }}>{data.prices.map((entry) => <option key={entry.id} value={entry.id}>{entry.description} · {formatMoney(money(entry.amountCents, data.currency), locale)}</option>)}</Select></div>
      <div className="grid gap-1.5"><Label htmlFor={`claim-reason-${String(index)}`}>{t('lineReason')}</Label><Textarea id={`claim-reason-${String(index)}`} value={row.reason} maxLength={1000} onChange={(event) => { setRows(rows.map((each, position) => position === index ? { ...each, reason: event.target.value } : each)) }} /></div>
    </fieldset>)}
    <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-5">
      <Button type="submit" variant={leading ? 'default' : 'outline'} disabled={pending || blocked || lines.length === 0} className="max-sm:w-full">{t('prepare')}</Button>
      <Button type="button" variant="ghost" className="max-sm:w-full" disabled={rows.length >= 50} onClick={() => { setRows([...rows, { priceEntryId: data.prices[0]?.id ?? '', reason: '' }]) }}><Plus aria-hidden="true" />{t('addLine')}</Button>
    </div>
    <ActionMessage result={result} success={t('prepared')} results="claim.results" />
  </form>
}
