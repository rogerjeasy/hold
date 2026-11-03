'use client'

import type { StaffRole } from '@hold/domain'
import type { Person } from '@hold/db'
import { Check, ChevronsUpDown } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { switchShop } from '@/features/shop/choose-shop'
import { initials } from './initials'

// Which shop this is and the person's role in it. A person in more than one shop moves between them here; the
// server checks the choice again on every request.
export function ShopSwitcher({ person, shop, role }: { person: Person; shop: { id: string; name: string }; role: StaffRole }) {
  const t = useTranslations('shell')
  const roles = useTranslations('shop.staff.roles')
  const locale = useLocale()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('switchShop', { shop: shop.name })}
        className="flex min-h-13 w-full min-w-0 items-center gap-3 rounded-xl border border-band-border bg-band-hover/50 px-2.5 py-2 text-left transition-colors hover:border-band-muted hover:bg-band-hover"
      >
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-band-active text-xs font-extrabold tracking-tight">
          {initials(shop.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] leading-tight font-bold">{shop.name}</span>
          <span className="block truncate text-xs text-band-muted">{roles(role)}</span>
        </span>
        <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-band-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="label text-xs text-muted-foreground">{t('shops')}</DropdownMenuLabel>
        {person.shops.map((each) =>
          each.shopId === shop.id ? (
            <DropdownMenuItem key={each.shopId} disabled className="min-h-11 opacity-100!">
              <span className="min-w-0 flex-1 truncate font-semibold">{each.name}</span>
              <Check aria-label={t('current')} className="size-4 text-primary" />
            </DropdownMenuItem>
          ) : (
            <form key={each.shopId} action={switchShop}>
              <input type="hidden" name="shopId" value={each.shopId} />
              <input type="hidden" name="locale" value={locale} />
              <DropdownMenuItem asChild className="min-h-11 w-full">
                <button type="submit">
                  <span className="min-w-0 flex-1 truncate text-left">{each.name}</span>
                  <span className="text-xs text-muted-foreground">{roles(each.role)}</span>
                </button>
              </DropdownMenuItem>
            </form>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
