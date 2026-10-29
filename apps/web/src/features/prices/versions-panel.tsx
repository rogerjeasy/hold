'use client'

import type { PriceListVersion } from '@hold/db'
import { diffPriceLists, money } from '@hold/domain'
import type { PriceCategory } from '@hold/domain'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import { Select } from '@/components/ui/select'
import { formatMoney } from '@/lib/money'

type Entries = readonly { readonly description: string; readonly category: PriceCategory; readonly amountCents: number }[]

type VersionsPanelProps = { versions: readonly PriceListVersion[]; currency: string; draft: { readonly entries: Entries; readonly wearPolicy: string } }

const DRAFT = 'draft'

// Every published version with the open rentals agreed to it, and what changed between any two of them, or between one
// and this draft: a renter is held to the version they agreed to, so a shop must see what a newer one changes.
export function VersionsPanel({ versions, currency, draft }: VersionsPanelProps) {
  const t = useTranslations('shop.priceEditor')
  const format = useFormatter()
  const locale = useLocale()
  const id = useId()
  const [from, setFrom] = useState(String(versions[0]?.version ?? ''))
  const [to, setTo] = useState(DRAFT)
  const amount = (cents: number) => formatMoney(money(cents, currency), locale)
  const side = (choice: string) => (choice === DRAFT ? draft : versions.find((version) => String(version.version) === choice))
  const before = side(from)
  const after = side(to)
  const diff = before === undefined || after === undefined ? undefined : diffPriceLists(before, after)
  const options = (withDraft: boolean) => [
    ...(withDraft ? [<option key={DRAFT} value={DRAFT}>{t('diff.draft')}</option>] : []),
    ...versions.map((version) => <option key={version.version} value={String(version.version)}>{t('versions.version', { version: version.version })}</option>),
  ]
  return (
    <div className="grid gap-10">
      <section aria-labelledby={`${id}-versions`} className="grid gap-4">
        <h2 id={`${id}-versions`} className="text-title">{t('versions.title')}</h2>
        <p className="max-w-prose text-muted-foreground">{t('versions.lead')}</p>
        {versions.length === 0 ? <p>{t('versions.none')}</p> : (
          <ul className="grid divide-y border bg-card text-card-foreground">
            {versions.map((version, index) => (
              <li key={version.version} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-4 md:px-5">
                <span className="font-semibold">
                  {t('versions.version', { version: version.version })}
                  {index === 0 ? <span className="label ml-2 border border-border-strong px-1.5 py-px text-[0.625rem] text-muted-foreground">{t('versions.inForce')}</span> : null}
                </span>
                <span className="text-sm text-muted-foreground sm:text-right">{t('versions.published', { date: format.dateTime(version.publishedAt, { dateStyle: 'medium' }) })} · {t('versions.prices', { count: version.entries.length })}</span>
                <span className="text-sm sm:col-span-2">{t('versions.live', { count: version.liveRentals })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {versions.length === 0 ? null : (
        <section aria-labelledby={`${id}-diff`} className="grid gap-4">
          <h2 id={`${id}-diff`} className="text-title">{t('diff.title')}</h2>
          <div className="grid max-w-md grid-cols-2 gap-3">
            <div className="grid gap-1.5"><label htmlFor={`${id}-from`} className="text-sm font-semibold">{t('diff.from')}</label><Select id={`${id}-from`} value={from} onChange={(event) => { setFrom(event.target.value) }}>{options(false)}</Select></div>
            <div className="grid gap-1.5"><label htmlFor={`${id}-to`} className="text-sm font-semibold">{t('diff.to')}</label><Select id={`${id}-to`} value={to} onChange={(event) => { setTo(event.target.value) }}>{options(true)}</Select></div>
          </div>
          {diff === undefined ? null : (
            <div className="grid gap-5 border bg-card p-4 text-card-foreground md:p-5">
              {diff.added.length + diff.removed.length + diff.changed.length === 0 ? <p>{t('diff.nothing')}</p> : null}
              {([['changed', diff.changed.map((each) => ({ code: each.code, text: `${each.description} · ${t('diff.change', { from: amount(each.from.amountCents), to: amount(each.to.amountCents) })}` }))],
                ['added', diff.added.map((each) => ({ code: each.code, text: `${each.description} · ${amount(each.amountCents)}` }))],
                ['removed', diff.removed.map((each) => ({ code: each.code, text: `${each.description} · ${amount(each.amountCents)}` }))]] as const).map(([kind, lines]) => lines.length === 0 ? null : (
                <div key={kind} className="grid gap-1.5">
                  <h3 className="label text-xs text-muted-foreground">{t(`diff.${kind}`)}</h3>
                  <ul className="grid gap-1">{lines.map((line) => <li key={line.code} className="wrap-long-words">{line.text}</li>)}</ul>
                </div>
              ))}
              <p className="text-sm text-muted-foreground">{t('diff.unchanged', { count: diff.unchanged })} {diff.wearPolicyChanged ? t('diff.wearChanged') : t('diff.wearSame')}</p>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
