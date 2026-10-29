'use client'

import { CircleCheck, TriangleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId } from 'react'
import { SampleTag } from '@/components/ui/sample-tag'
import type { LedgerRentalRow, LedgerRow } from './ledger-rows'
import type { LedgerText } from './use-ledger-text'

// One rental's money on a phone: whose it is, what its checks found, its figures and each line of its money log.
function RentalCard({ rental, lines, text }: { rental: LedgerRentalRow; lines: readonly LedgerRow[]; text: LedgerText }) {
  const t = useTranslations('money')
  const titleId = useId()
  const agrees = rental.money.checks.length === 0
  return (
    <article aria-labelledby={titleId} className="grid min-w-0 gap-3 border bg-card p-4 text-card-foreground">
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 id={titleId} className="font-bold leading-snug wrap-long-words">{text.renter(rental)}</h2>
          {rental.simulated ? <SampleTag /> : null}
        </div>
        <p className="text-sm text-muted-foreground">{text.period(rental)}</p>
      </div>
      <p className={agrees ? 'flex gap-1.5 text-sm' : 'flex gap-1.5 text-sm font-semibold text-destructive'}>
        {agrees ? <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" /> : <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
        {text.checks(rental.money.checks)}
      </p>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        {([{ key: 'toShop', cents: rental.money.toShopCents }, { key: 'backToRenter', cents: rental.money.backCents }, { key: 'heldNow', cents: rental.money.heldNowCents }] as const).map((figure) => (
          <div key={figure.key} className="grid min-w-0 gap-0.5">
            <dt className="label text-xs text-muted-foreground">{t(`group.${figure.key}`)}</dt>
            <dd className="figures wrap-long-words">{text.money(figure.cents)}</dd>
          </div>
        ))}
      </dl>
      <ul className="grid divide-y border-t">
        {lines.map((line) => (
          <li key={line.id} className="grid gap-0.5 py-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="min-w-0 font-semibold wrap-long-words">{text.what(line)}</span>
              <span className="figures">{text.money(line.amountCents)}</span>
            </div>
            <span className="figures text-xs text-muted-foreground">{text.moment(line.occurredAt)}</span>
          </li>
        ))}
      </ul>
    </article>
  )
}

// The ledger below the medium width: a card per rental, in the grid's order, holding the same lines.
export function LedgerCards({ rows, text }: { rows: readonly LedgerRow[]; text: LedgerText }) {
  const t = useTranslations('money')
  const rentals = [...new Map(rows.map((row) => [row.rentalId, row.rental])).values()]
  return (
    <ul aria-label={t('cards')} className="grid gap-3">
      {rentals.map((rental) => (
        <li key={rental.rentalId} className="min-w-0">
          <RentalCard rental={rental} lines={rows.filter((row) => row.rentalId === rental.rentalId)} text={text} />
        </li>
      ))}
    </ul>
  )
}
