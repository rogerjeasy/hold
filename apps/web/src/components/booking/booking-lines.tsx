'use client'

import { bookingTerms, money } from '@hold/domain'
import type { BookableType } from '@hold/db'
import { Minus, Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/money'
import { BookingTotals } from './booking-totals'

type BookingLinesProps = { types: readonly BookableType[]; currency: string; days: number }

// A counter for each item type, up to what is free, and the booking's two amounts as they add up. The amounts shown
// here are a preview: the server prices the booking again from the item types.
export function BookingLines({ types, currency, days }: BookingLinesProps) {
  const t = useTranslations('booking')
  const locale = useLocale()
  const [counts, setCounts] = useState<Readonly<Record<string, number>>>({})
  const count = (id: string) => counts[id] ?? 0
  const change = (id: string, by: 1 | -1) => {
    setCounts((current) => ({ ...current, [id]: Math.max(0, (current[id] ?? 0) + by) }))
  }
  const chosen = types.filter((type) => count(type.id) > 0)
  const terms = bookingTerms(
    chosen.map((type) => ({ itemTypeId: type.id, count: count(type.id), dayRate: money(type.dayRateCents, currency), hold: money(type.holdCents, currency) })),
    days,
    currency,
  )

  return (
    <div className="grid gap-6">
      <ul className="surface grid divide-y divide-border/70 overflow-clip">
        {types.map((type) => (
          <li key={type.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 md:px-5">
            <div className="min-w-0">
              <p className="font-semibold wrap-long-words">{type.name}</p>
              <p className="text-sm text-muted-foreground">
                {t('perDay', { amount: formatMoney(money(type.dayRateCents, currency), locale) })} · {t('holdEach', { amount: formatMoney(money(type.holdCents, currency), locale) })}
              </p>
              <p className="text-[0.8125rem] text-muted-foreground">{t('free', { count: type.available })}</p>
            </div>
            <div className="flex items-center gap-1 rounded-xl bg-muted/60 p-1">
              <Button type="button" variant="ghost" size="icon" aria-label={t('fewer', { name: type.name })} disabled={count(type.id) === 0} onClick={() => { change(type.id, -1) }}>
                <Minus aria-hidden="true" />
              </Button>
              <span role="status" aria-label={t('countOf', { name: type.name })} className="figures w-8 text-center text-lg font-semibold">
                {count(type.id)}
              </span>
              <Button type="button" variant="ghost" size="icon" aria-label={t('more', { name: type.name })} disabled={count(type.id) >= type.available} onClick={() => { change(type.id, 1) }}>
                <Plus aria-hidden="true" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {chosen.map((type) => (
        <span key={type.id} hidden>
          <input type="hidden" name="itemTypeId" value={type.id} />
          <input type="hidden" name="count" value={count(type.id)} />
        </span>
      ))}
      <BookingTotals days={days} fee={terms.fee} hold={terms.hold} />
    </div>
  )
}
