'use client'

import type { BookableType } from '@hold/db'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useEffect } from 'react'
import { BookingLines } from '@/components/booking/booking-lines'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { ActionMessage } from '@/features/shop/action-message'
import { useRouter } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import { rentalRoutes } from '@/lib/routes'
import { bookRental } from './actions'

type BookingFormProps = { types: readonly BookableType[]; currency: string; days: number; from: string; to: string }

const LANGUAGE_NAMES: Readonly<Record<string, string>> = { en: 'English', de: 'Deutsch', es: 'Español', fr: 'Français' }

// What to book and for whom. The dates come from the form above it; the booking opens once it is made.
export function BookingForm({ types, currency, days, from, to }: BookingFormProps) {
  const t = useTranslations('shop.rentals.form')
  const locale = useLocale()
  const router = useRouter()
  const [result, book, pending] = useActionState(bookRental, null)

  useEffect(() => {
    if (result?.ok === true) router.push(rentalRoutes.rental(result.value.rentalId))
  }, [result, router])

  return (
    <form action={book} className="grid gap-8">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="startsAt" value={from} />
      <input type="hidden" name="endsAt" value={to} />
      <BookingLines types={types} currency={currency} days={days} />
      <fieldset className="grid gap-4">
        <legend className="text-title">{t('renter')}</legend>
        <p className="max-w-prose text-muted-foreground">{t('renterHelp')}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="contactName">{t('name')}</Label>
            <Input id="contactName" name="contactName" maxLength={120} autoComplete="off" />
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="contactEmail">{t('email')}</Label>
            <Input id="contactEmail" name="contactEmail" type="email" maxLength={254} autoComplete="off" />
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="language">{t('language')}</Label>
            <Select id="language" name="language" defaultValue={locale}>
              {routing.locales.map((each) => (
                <option key={each} value={each}>
                  {LANGUAGE_NAMES[each] ?? each}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </fieldset>
      <div className="grid gap-3">
        <Button type="submit" disabled={pending} className="min-h-12 justify-self-start">
          {pending ? t('booking') : t('book')}
        </Button>
        <ActionMessage result={result} success={t('booked')} results="shop.rentals.results" />
      </div>
    </form>
  )
}
