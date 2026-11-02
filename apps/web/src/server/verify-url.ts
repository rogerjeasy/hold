import 'server-only'
import { routes } from '@/lib/routes'

// The address that checks a token Hold signed (a Clean Record credential or an evidence statement), with the token
// after the #, so it never reaches a server or its logs.
export function verifyUrl(publicUrl: string, locale: string, token: string): string {
  return `${publicUrl}${locale === 'en' ? '' : `/${locale}`}${routes.verify}#${token}`
}
