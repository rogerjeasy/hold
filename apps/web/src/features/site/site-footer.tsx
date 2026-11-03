import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { routes } from '@/lib/routes'
import { LegalLinks } from './legal-links'
import { Logo } from './logo'
import { navItems, type NavItem } from './nav-items'

const productKeys: readonly NavItem['key'][] = ['howItWorks', 'ai', 'paypal']

function FooterLinks({ title, items }: { title: string; items: readonly NavItem[] }) {
  const t = useTranslations('nav')

  return (
    <div className="min-w-0">
      <h2 className="label mb-2 text-xs text-muted-foreground">{title}</h2>
      <ul>
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className="inline-flex min-h-11 min-w-11 items-center text-[0.9375rem] font-medium transition-colors duration-200 hover:text-primary"
            >
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
    <footer className="overflow-clip border-t border-border/70 bg-card/50">
      <div className="mx-auto max-w-page px-4 pt-16 pb-6 md:px-8 lg:px-10 lg:pt-20">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:gap-x-10 lg:grid-cols-[2fr_1fr_1fr_1.6fr]">
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <Logo />
            <p className="mt-4 max-w-xs text-xl leading-snug font-bold tracking-tight text-balance">{t('tagline')}</p>
          </div>
          <FooterLinks title={t('product')} items={product} />
          <FooterLinks title={t('forYou')} items={audiences} />
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <h2 className="label mb-2 text-xs text-muted-foreground">{t('about')}</h2>
            <p className="mt-3 text-[0.9375rem] text-muted-foreground">{t('aboutBody')}</p>
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-border/70 pt-4 text-sm lg:mt-16 text-muted-foreground lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <p>{t('rights', { year: String(year) })}</p>
          <LegalLinks />
          <p className="wrap-long-words">{t('credits')}</p>
        </div>
        {/* The name across the foot of the page, cut by its edge, as a signature. It is drawn, not read: the logo above
            names the site. */}
        <div
          aria-hidden="true"
          className="pointer-events-none mt-2 -mb-6 h-[0.62em] overflow-clip text-[calc((min(100vw,80rem)-2rem)/2.08)] leading-none opacity-[0.07] select-none md:text-[calc((min(100vw,80rem)-4rem)/2.08)] lg:mt-0 lg:text-[calc((min(100vw,80rem)-5rem)/2.08)] dark:opacity-[0.1]"
        >
          {/* As wide as its letters, with room for the last one's tight tracking, so nothing in it overflows its own box. */}
          <Logo className="block w-max pe-[0.06em] text-[1em]" />
        </div>
      </div>
    </footer>
  )
}
