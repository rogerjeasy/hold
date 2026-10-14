import { notFound } from 'next/navigation'
import * as rootParams from 'next/root-params'
import { hasLocale } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'
import { routing } from './routing'
import { timeZone } from './time-zone'

// A page takes its language from its route. Code outside a route, such as a server function writing an email in
// the reader's language, names the language instead.
export default getRequestConfig(async ({ locale: named }) => {
  const locale = named ?? (await rootParams.locale())
  if (!hasLocale(routing.locales, locale)) notFound()
  const messages = (await import(`../../messages/${locale}.json`)) as { default: IntlMessages }

  return { locale, messages: messages.default, timeZone }
})
