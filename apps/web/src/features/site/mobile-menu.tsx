'use client'

import { Menu } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Link } from '@/i18n/navigation'
import { useSignedIn } from '@/hooks/use-signed-in'
import { routes, shopRoutes } from '@/lib/routes'
import { navItems } from './nav-items'

export function MobileMenu({ className }: { className?: string }) {
  const t = useTranslations('nav')
  const signedIn = useSignedIn()
  const [open, setOpen] = useState(false)
  const close = () => {
    setOpen(false)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('openMenu')} className={className}>
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" closeLabel={t('closeMenu')} className="w-full gap-0 sm:max-w-sm">
        <SheetHeader className="border-b">
          <SheetTitle className="label text-muted-foreground">{t('menuTitle')}</SheetTitle>
        </SheetHeader>
        <nav aria-label={t('menuTitle')} className="flex flex-1 flex-col overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <ul>
            {navItems.map((item) => (
              <li key={item.key} className="border-b">
                <Link href={item.href} onClick={close} className="flex min-h-14 items-center text-2xl font-bold tracking-tight">
                  {t(item.key)}
                </Link>
              </li>
            ))}
          </ul>
          <Button asChild className="mt-6 min-h-12">
            <Link href={routes.demo} onClick={close}>
              {t('demo')}
            </Link>
          </Button>
          <Button asChild variant="outline" className="mt-2.5 min-h-12">
            <Link href={signedIn ? shopRoutes.home : routes.signIn} onClick={close}>
              {signedIn ? t('yourShop') : t('signIn')}
            </Link>
          </Button>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
