'use client'

import { Menu } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Logo } from '@/features/site/logo'
import { Link } from '@/i18n/navigation'
import { shopRoutes } from '@/lib/routes'
import { ShellTools } from './shell-tools'
import type { ShellProps } from './shell-props'
import { ShopNav } from './shop-nav'
import { ShopSwitcher } from './shop-switcher'

// The shop's frame on a phone: the logo and the shop's name, and the whole menu behind one button.
export function ShopTopBar({ person, shop, role, paypalConnected }: ShellProps) {
  const t = useTranslations('shell')
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 flex min-h-14 items-center gap-2 bg-band pr-1.5 pl-4 text-band-foreground md:hidden">
      <Link href={shopRoutes.home} aria-label={t('home', { shop: shop.name })} className="inline-flex min-h-11 items-center">
        <Logo />
      </Link>
      <p className="ml-2 min-w-0 flex-1 truncate text-sm font-semibold text-band-foreground/75">{shop.name}</p>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('openMenu')} className="text-band-foreground hover:bg-band-hover hover:text-band-foreground">
            <Menu aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" closeLabel={t('closeMenu')} className="w-full gap-0 border-band-border bg-band text-band-foreground sm:max-w-sm [&>button]:text-band-foreground">
          <SheetHeader className="border-b border-band-border">
            <SheetTitle className="label text-band-muted">{t('menuTitle')}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pt-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <ShopSwitcher person={person} shop={shop} role={role} />
            <ShopNav
              className="flex-1"
              onNavigate={() => {
                setOpen(false)
              }}
            />
            <ShellTools person={person} paypalConnected={paypalConnected} />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  )
}
