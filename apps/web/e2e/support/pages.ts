import { routing } from '../../src/i18n/routing'
import { routes, type RouteKey } from '../../src/lib/routes'

export const locales = routing.locales
export const defaultLocale = routing.defaultLocale

export type Locale = (typeof locales)[number]

// Every public page. A new page is added to `routes`, and from there to every check that walks this list.
export const pages = Object.entries(routes).map(([key, path]) => ({ key: key as RouteKey, path }))

export function localized(path: string, locale: Locale): string {
  if (locale === defaultLocale) return path
  return path === '/' ? `/${locale}` : `/${locale}${path}`
}
