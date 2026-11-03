'use client'

import type { BookableType } from '@hold/db'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useEffect } from 'react'
import { BookingLines } from '@/components/booking/booking-lines'
import { Button } from '@/components/ui/button'
import { RenterMessage } from '@/features/renter/renter-message'
import { bookOnShopPage } from './actions'

type ShopBookingFormProps = { slug: string; types: readonly BookableType[]; currency: string; days: number; from: string; to: string }

// Books with nobody signed in, then takes the renter to their own link, where they see the terms and pay the fee.
export function ShopBookingForm({ slug, types, currency, days, from, to }: ShopBookingFormProps) {
  const t = useTranslations('shopPage')
  const locale = useLocale()
  const [result, book, pending] = useActionState(bookOnShopPage, null)
  useEffect(() => {
    if (result?.ok === true) window.location.assign(result.value.url)
  }, [result])
  const refused = result === null || result.ok ? null : result
  return (
    <form action={book} className="grid gap-6">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="shop" value={slug} />
      <input type="hidden" name="startsAt" value={from} />
      <input type="hidden" name="endsAt" value={to} />
      <BookingLines types={types} currency={currency} days={days} />
      <Button type="submit" disabled={pending || result?.ok === true} className="min-h-12 w-full sm:w-auto sm:justify-self-start">
        {pending || result?.ok === true ? t('booking') : t('book')}
      </Button>
      <ShopPageMessage result={refused} />
    </form>
  )
}

// A refusal in the shop page's own words where it has them, and the renter's otherwise.
function ShopPageMessage({ result }: { result: { readonly ok: false; readonly failure: string; readonly reason?: string } | null }) {
  const t = useTranslations('shopPage.results')
  const rentals = useTranslations('shop.rentals.results')
  if (result === null) return null
  const reason = result.failure === 'refused' ? (result.reason ?? '') : result.failure
  const [key = '', row] = reason.split(':')
  if (t.has(key as Parameters<typeof t>[0]) || !rentals.has(key as Parameters<typeof rentals>[0])) return <RenterMessage result={result} />
  return (
    <p role="alert" className="text-[0.9375rem] text-destructive">
      {rentals(key as Parameters<typeof rentals>[0], { row: row === undefined ? '' : String(Number(row) + 1) })}
    </p>
  )
}
