import { render, type RenderResult } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactElement, ReactNode } from 'react'
import type { Locale } from '@/i18n/routing'
import { timeZone } from '@/i18n/time-zone'
import en from '../../messages/en.json'

type Options = {
  locale?: Locale
  messages?: IntlMessages
}

// Through `wrapper`, so a re-render keeps the provider.
export function renderWithIntl(ui: ReactElement, { locale = 'en', messages = en }: Options = {}): RenderResult {
  return render(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
        {children}
      </NextIntlClientProvider>
    ),
  })
}
