'use client'

import { cn } from 'cn'
import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import { shopRoutes } from '@/lib/routes'
import type { StaffRole } from '@hold/domain'
import { navGroupsFor } from './shop-nav-items'

// The shop's menu, in the dark band: every page by its name and icon, the current one lit with the accent.
export function ShopNav({ role, onNavigate, className }: { role: StaffRole; onNavigate?: () => void; className?: string }) {
  const t = useTranslations('shop.nav')
  const pathname = usePathname()

  return (
    <nav aria-label={t('label')} className={className}>
      {navGroupsFor(role).map((group) => (
        <div key={group.label ?? 'work'} className="not-first:mt-6">
          {group.label === null ? null : <p className="label mb-2 px-3 text-[0.6875rem] text-band-muted">{t(group.label)}</p>}
          <ul className="grid gap-0.5">
            {group.items.map(({ key, icon: Icon }) => {
              const href = shopRoutes[key]
              const current = pathname === href || (href !== shopRoutes.home && pathname.startsWith(`${href}/`))
              return (
                <li key={key}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-[0.9375rem] font-medium text-band-foreground/70 transition-[background-color,color] duration-200 hover:bg-band-hover hover:text-band-foreground',
                      'aria-[current=page]:bg-band-active aria-[current=page]:font-semibold aria-[current=page]:text-band-foreground aria-[current=page]:shadow-[inset_0_1px_0_rgb(255_255_255/0.05)]',
                    )}
                  >
                    <Icon aria-hidden="true" className="size-[1.125rem] shrink-0 transition-colors group-aria-[current=page]:text-band-accent" />
                    <span className="min-w-0 flex-1 truncate">{t(key)}</span>
                    <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-band-accent opacity-0 transition-opacity group-aria-[current=page]:opacity-100" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
