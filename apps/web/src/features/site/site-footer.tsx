import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { routes } from '@/lib/routes'
import { Logo } from './logo'
import { navItems, type NavItem } from './nav-items'

const productKeys: readonly NavItem['key'][] = ['howItWorks', 'ai', 'paypal']

function FooterLinks({ title, items }: { title: string; items: readonly NavItem[] }) {
  const t = useTranslations('nav')

  return (
    <div>
      <h2 className="label mb-1.5 text-muted-foreground">{title}</h2>
      <ul>
        {items.map((item) => (
          <li key={item.key}>
            <Link href={item.href} className="inline-flex min-h-11 min-w-11 items-center hover:underline">
              {t(item.key)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SiteFooter({ year }: { year: number }) {
  const t = useTranslations('footer')
  // The published scorecard sits with the product pages, though the header has no room for it.
  const product = [...navItems.filter((item) => productKeys.includes(item.key)), { key: 'reliability', href: routes.reliability } as const]
  const audiences = navItems.filter((item) => !productKeys.includes(item.key))

  return (
    <footer className="border-t">
      <div className="mx-auto max-w-page px-4 pt-14 pb-6 md:px-8 lg:px-10">
        <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1.6fr]">
          <div>
            <Logo />
            <p className="mt-3 max-w-prose text-[0.9375rem] text-muted-foreground">{t('tagline')}</p>
          </div>
          <FooterLinks title={t('product')} items={product} />
          <FooterLinks title={t('forYou')} items={audiences} />
          <div>
            <h2 className="label mb-1.5 text-muted-foreground">{t('about')}</h2>
            <p className="mt-2 text-[0.9375rem] text-muted-foreground">{t('aboutBody')}</p>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t pt-4 text-sm text-muted-foreground lg:flex-row lg:justify-between lg:gap-6">
          <p>{t('rights', { year: String(year) })}</p>
          <p>{t('credits')}</p>
        </div>
      </div>
    </footer>
  )
}
