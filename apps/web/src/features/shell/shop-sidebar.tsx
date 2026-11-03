import { useTranslations } from 'next-intl'
import { Logo } from '@/features/site/logo'
import { Link } from '@/i18n/navigation'
import { shopRoutes } from '@/lib/routes'
import { ShellTools } from './shell-tools'
import type { ShellProps } from './shell-props'
import { ShopNav } from './shop-nav'
import { ShopSwitcher } from './shop-switcher'

// The shop's menu from the lg breakpoint, in the dark band, every page named. Below lg it is behind the tab bar.
export function ShopSidebar({ person, shop, role, paypalConnected }: ShellProps) {
  const t = useTranslations('shell')

  return (
    <aside className="sticky top-0 hidden h-dvh flex-col gap-5 overflow-y-auto overscroll-contain px-3 pt-5 pb-3 text-band-foreground [scrollbar-color:var(--band-border)_transparent] lg:flex">
      <Link href={shopRoutes.home} aria-label={t('home', { shop: shop.name })} className="inline-flex min-h-11 items-center self-start rounded-lg px-3 transition-opacity hover:opacity-85">
        <Logo />
      </Link>
      <ShopSwitcher person={person} shop={shop} role={role} />
      <ShopNav role={role} className="flex-1" />
      <ShellTools person={person} paypalConnected={paypalConnected} />
    </aside>
  )
}
