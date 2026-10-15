import { useTranslations } from 'next-intl'
import { Logo } from '@/features/site/logo'
import { Link } from '@/i18n/navigation'
import { shopRoutes } from '@/lib/routes'
import { ShellTools } from './shell-tools'
import type { ShellProps } from './shell-props'
import { ShopNav } from './shop-nav'
import { ShopSwitcher } from './shop-switcher'

// The shop's menu from the md breakpoint: a rail of icons on a tablet, the full menu from lg.
export function ShopSidebar({ person, shop, role, paypalConnected }: ShellProps) {
  const t = useTranslations('shell')

  return (
    <aside className="sticky top-0 hidden h-dvh flex-col gap-5 overflow-y-auto border-r border-band-border bg-band px-3 pt-5 pb-3 text-band-foreground md:flex">
      <Link href={shopRoutes.home} aria-label={t('home', { shop: shop.name })} className="inline-flex min-h-11 items-center px-3 md:max-lg:justify-center md:max-lg:px-0">
        <Logo />
      </Link>
      <ShopSwitcher person={person} shop={shop} role={role} />
      <ShopNav className="flex-1" />
      <ShellTools person={person} paypalConnected={paypalConnected} />
    </aside>
  )
}
