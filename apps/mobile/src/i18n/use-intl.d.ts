import type { AppLocale, Messages } from '@/i18n';

// Message keys and locales are checked by the compiler: a key missing from en.json does not build.
declare module 'use-intl' {
  interface AppConfig {
    Locale: AppLocale;
    Messages: Messages;
  }
}
