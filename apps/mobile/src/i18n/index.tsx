import type { ReactNode } from 'react';
import { useCalendars, useLocales } from 'expo-localization';
import { IntlProvider } from 'use-intl';
import de from '../../messages/de.json';
import en from '../../messages/en.json';
import es from '../../messages/es.json';
import fr from '../../messages/fr.json';

// The languages Hold speaks, the same four as the web app. English is the fallback.
export const LOCALES = ['en', 'fr', 'de', 'es'] as const;
export type AppLocale = (typeof LOCALES)[number];

export type Messages = typeof en;
export const MESSAGES: Readonly<Record<AppLocale, Messages>> = { en, fr, de, es };

const isAppLocale = (code: string | null): code is AppLocale => LOCALES.some((locale) => locale === code);

// The phone's first language that Hold speaks, in the order the person set them.
export function pickLocale(phoneLocales: readonly { languageCode: string | null }[]): AppLocale {
  return phoneLocales.map((locale) => locale.languageCode).find(isAppLocale) ?? 'en';
}

// Follows the phone's language and time zone, and changes with them while the app runs.
export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = pickLocale(useLocales());
  const [calendar] = useCalendars();
  return (
    <IntlProvider locale={locale} messages={MESSAGES[locale]} timeZone={calendar?.timeZone ?? 'UTC'}>
      {children}
    </IntlProvider>
  );
}
