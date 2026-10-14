import { render, type RenderResult } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactElement } from 'react'
import type { Locale } from '@/i18n/routing'
import { timeZone } from '@/i18n/time-zone'
import en from '../../messages/en.json'

type Options = {
  locale?: Locale
  messages?: IntlMessages
}

export function renderWithIntl(ui: ReactElement, { locale = 'en', messages = en }: Options = {}): RenderResult {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
      {ui}
    </NextIntlClientProvider>,
  )
}
