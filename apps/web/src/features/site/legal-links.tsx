import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { routes } from '@/lib/routes'

const legalKeys = ['privacy', 'terms'] as const

// The privacy notice and the terms of use, from every public page and every page a renter opens. A renter's page has
// their signed link in its address, so no referrer is sent.
export function LegalLinks() {
  const nav = useTranslations('nav')
  const footer = useTranslations('footer')
  return (
    <nav aria-label={footer('legal')}>
      <ul className="flex flex-wrap gap-x-5">
        {legalKeys.map((key) => (
          <li key={key}>
            <Link href={routes[key]} referrerPolicy="no-referrer" className="inline-flex min-h-11 min-w-11 items-center hover:underline">
              {nav(key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
