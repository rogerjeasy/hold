'use client'

import type { PriceListVersion } from '@hold/db'
import { diffPriceLists, money } from '@hold/domain'
import type { PriceCategory } from '@hold/domain'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import { GitCompareArrows, History } from 'lucide-react'
import { Panel } from '@/components/ui/panel'
import { Select } from '@/components/ui/select'
import { StatusPill } from '@/components/ui/status-pill'
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
  const changes = diff === undefined ? [] : ([
    ['changed', 'progress', diff.changed.map((each) => ({ code: each.code, text: `${each.description} · ${t('diff.change', { from: amount(each.from.amountCents), to: amount(each.to.amountCents) })}` }))],
    ['added', 'success', diff.added.map((each) => ({ code: each.code, text: `${each.description} · ${amount(each.amountCents)}` }))],
    ['removed', 'danger', diff.removed.map((each) => ({ code: each.code, text: `${each.description} · ${amount(each.amountCents)}` }))],
  ] as const)
  return (
    <div className="grid min-w-0 items-start gap-6 lg:grid-cols-2">
      <Panel title={t('versions.title')} icon={History}>
        <p className="border-b border-border/70 px-4 py-3 text-sm text-muted-foreground md:px-5">{t('versions.lead')}</p>
        {versions.length === 0 ? <p className="px-4 py-5 text-muted-foreground md:px-5">{t('versions.none')}</p> : (
          <ul className="stagger">
            {versions.map((version, index) => (
              <li key={version.version} className="grid gap-1 border-b border-border/70 px-4 py-3.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-4 md:px-5">
                <span className="flex flex-wrap items-center gap-2 font-semibold">
                  {t('versions.version', { version: version.version })}
                  {index === 0 ? <StatusPill tone="success">{t('versions.inForce')}</StatusPill> : null}
                </span>
                <span className="text-sm text-muted-foreground sm:text-right">{t('versions.published', { date: format.dateTime(version.publishedAt, { dateStyle: 'medium' }) })} · {t('versions.prices', { count: version.entries.length })}</span>
                <span className="text-sm sm:col-span-2">{t('versions.live', { count: version.liveRentals })}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {versions.length === 0 ? null : (
        <Panel title={t('diff.title')} icon={GitCompareArrows}>
          <div className="grid gap-5 p-4 md:p-5">
            <div className="grid max-w-md grid-cols-2 gap-3">
              <div className="grid min-w-0 gap-1.5"><label htmlFor={`${id}-from`} className="text-sm font-semibold">{t('diff.from')}</label><Select id={`${id}-from`} value={from} onChange={(event) => { setFrom(event.target.value) }}>{options(false)}</Select></div>
              <div className="grid min-w-0 gap-1.5"><label htmlFor={`${id}-to`} className="text-sm font-semibold">{t('diff.to')}</label><Select id={`${id}-to`} value={to} onChange={(event) => { setTo(event.target.value) }}>{options(true)}</Select></div>
            </div>
            {diff === undefined ? null : (
              <div className="grid gap-4 border-t border-border/70 pt-4">
                {diff.added.length + diff.removed.length + diff.changed.length === 0 ? <p>{t('diff.nothing')}</p> : null}
                {changes.map(([kind, tone, lines]) => lines.length === 0 ? null : (
                  <div key={kind} className="grid gap-2">
                    <h3 className="label text-xs text-muted-foreground">{t(`diff.${kind}`)}</h3>
                    <ul className="grid gap-1.5">
                      {lines.map((line) => (
                        <li key={line.code} className="flex min-w-0 gap-2.5 wrap-long-words">
                          <span aria-hidden="true" className={`mt-2 size-1.5 shrink-0 rounded-full ${tone === 'success' ? 'bg-success' : tone === 'danger' ? 'bg-destructive' : 'bg-primary'}`} />
                          <span className="min-w-0">{line.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <p className="text-sm text-muted-foreground">{t('diff.unchanged', { count: diff.unchanged })} {diff.wearPolicyChanged ? t('diff.wearChanged') : t('diff.wearSame')}</p>
              </div>
            )}
          </div>
        </Panel>
      )}
    </div>
  )
}
