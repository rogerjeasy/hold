'use client'

import { NextIntlClientProvider, useTimeZone, useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import { TermsView } from '@/components/booking/terms-view'
import { Select } from '@/components/ui/select'
import { routing } from '@/i18n/routing'
import type { Locale } from '@/i18n/routing'

// The words a renter reads around the shop's own prices, in each language Hold speaks.
export type TermsMessages = { readonly prices: string; readonly pricesLead: string; readonly wear: string; readonly wearLead: string }

type TermsPreviewProps = {
  currency: string
  prices: readonly { readonly description: string; readonly category: 'damage' | 'loss' | 'lateness' | 'cleaning'; readonly amountCents: number }[]
  wearPolicy: string
  terms: Readonly<Record<Locale, TermsMessages>>
}

// The draft as a renter will read it before booking: the same view the renter's pages draw, in the language chosen
// here. The shop's descriptions stay in the shop's words.
export function TermsPreview({ currency, prices, wearPolicy, terms }: TermsPreviewProps) {
  const t = useTranslations('shop.priceEditor')
  const timeZone = useTimeZone()
  const [language, setLanguage] = useState<Locale>(routing.defaultLocale)
  const id = useId()
  const isLocale = (value: string): value is Locale => routing.locales.some((each) => each === value)
  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-4">
      <div className="grid gap-1">
        <h2 id={`${id}-title`} className="text-title">{t('preview.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('preview.lead')}</p>
      </div>
      <div className="grid max-w-60 gap-1.5">
        <label htmlFor={`${id}-language`} className="text-sm font-semibold">{t('preview.language')}</label>
        <Select id={`${id}-language`} value={language} onChange={(event) => { if (isLocale(event.target.value)) setLanguage(event.target.value) }}>
          {routing.locales.map((locale) => <option key={locale} value={locale} lang={locale}>{t(`languages.${locale}`)}</option>)}
        </Select>
      </div>
      {prices.length === 0 ? <p className="text-muted-foreground">{t('preview.empty')}</p> : (
        <div lang={language}>
          <NextIntlClientProvider locale={language} timeZone={timeZone} messages={{ renter: terms[language] }}>
            <TermsView currency={currency} prices={prices} wearPolicy={wearPolicy} />
          </NextIntlClientProvider>
        </div>
      )}
    </section>
  )
}
