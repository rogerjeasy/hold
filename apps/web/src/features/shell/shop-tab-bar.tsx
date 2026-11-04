'use client'

import { cn } from 'cn'
import { CalendarRange, Inbox, LayoutDashboard, Menu, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { LinkPendingIcon } from '@/components/ui/link-pending-icon'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Link, usePathname } from '@/i18n/navigation'
import { rentalRoutes, shopRoutes } from '@/lib/routes'
import { ShellTools } from './shell-tools'
import type { ShellProps } from './shell-props'
import { ShopNav } from './shop-nav'
import { ShopSwitcher } from './shop-switcher'

const tab = 'flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[0.6875rem] font-semibold text-band-foreground/65 transition-colors duration-200 hover:text-band-foreground aria-[current=page]:text-band-foreground'

// Below lg: the day's work and a new rental at the foot of the screen, where a thumb reaches at the counter, and the
// whole menu behind the last tab.
export function ShopTabBar({ person, shop, role, paypalConnected }: ShellProps) {
  const t = useTranslations('shell')
  const nav = useTranslations('shop.nav')
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const at = (href: string) => (pathname === href || (href !== shopRoutes.home && pathname.startsWith(`${href}/`) && pathname !== rentalRoutes.new) ? 'page' : undefined)

  const links = [
    { key: 'home', href: shopRoutes.home, icon: LayoutDashboard },
    { key: 'decisions', href: shopRoutes.decisions, icon: Inbox },
  ] as const

  return (
    <nav
      aria-label={t('quickLinks')}
      className="fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-40 flex items-center gap-1 rounded-2xl border border-band-border bg-band/95 p-1 text-band-foreground shadow-overlay backdrop-blur-lg lg:hidden"
    >
      {links.map(({ key, href, icon: Icon }) => (
        <Link key={key} href={href} aria-current={at(href)} className={cn(tab, 'group')}>
          <Icon aria-hidden="true" className="size-5 transition-colors group-aria-[current=page]:text-band-accent" />
          <span className="max-w-full truncate px-1">{nav(key)}</span>
        </Link>
      ))}
      {role === 'read_only' ? null : (
        <Link href={rentalRoutes.new} aria-current={pathname === rentalRoutes.new ? 'page' : undefined} className="grid min-h-14 flex-1 place-items-center">
          <span className="sr-only">{t('newRental')}</span>
          <span className="grid size-12 place-items-center rounded-2xl bg-band-accent text-mark-foreground shadow-glow transition-transform duration-200 active:scale-95">
            <LinkPendingIcon opening={t('openingPage')}><Plus aria-hidden="true" className="size-6" strokeWidth={2.5} /></LinkPendingIcon>
          </span>
        </Link>
      )}
      <Link href={shopRoutes.rentals} aria-current={at(shopRoutes.rentals)} className={cn(tab, 'group')}>
        <CalendarRange aria-hidden="true" className="size-5 transition-colors group-aria-[current=page]:text-band-accent" />
        <span className="max-w-full truncate px-1">{nav('rentals')}</span>
      </Link>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger aria-label={t('openMenu')} className={tab}>
          <Menu aria-hidden="true" className="size-5" />
          <span aria-hidden="true" className="max-w-full truncate px-1">{t('more')}</span>
        </SheetTrigger>
        <SheetContent side="right" closeLabel={t('closeMenu')} className="w-full gap-0 border-band-border bg-band text-band-foreground sm:max-w-sm [&>button]:text-band-foreground">
          <SheetHeader className="border-b border-band-border">
            <SheetTitle className="label text-band-muted">{t('menuTitle')}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pt-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <ShopSwitcher person={person} shop={shop} role={role} />
            <ShopNav
              role={role}
              className="flex-1"
              onNavigate={() => {
                setOpen(false)
              }}
            />
            <ShellTools person={person} paypalConnected={paypalConnected} />
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  )
}
