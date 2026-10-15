'use client'

import { cn } from 'cn'
import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import { shopRoutes } from '@/lib/routes'
import { shopNavGroups } from './shop-nav-items'

// The shop's menu, in the dark band. Between the md and lg breakpoints the sidebar is a rail of icons: the labels
// stay for screen readers and show as a tooltip.
export function ShopNav({ onNavigate, className }: { onNavigate?: () => void; className?: string }) {
  const t = useTranslations('shop.nav')
  const pathname = usePathname()

  return (
    <nav aria-label={t('label')} className={className}>
      {shopNavGroups.map((group) => (
        <div key={group.label ?? 'work'} className="not-first:mt-5 not-first:md:max-lg:mt-3 not-first:md:max-lg:border-t not-first:md:max-lg:border-band-border not-first:md:max-lg:pt-3">
          {group.label === null ? null : <p className="label mb-1.5 px-3 text-xs text-band-muted md:max-lg:sr-only">{t(group.label)}</p>}
          <ul className="grid gap-0.5">
            {group.items.map(({ key, icon: Icon }) => {
              const href = shopRoutes[key]
              const current = pathname === href
              return (
                <li key={key}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    title={t(key)}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'relative flex min-h-11 items-center gap-3 rounded-lg px-3 font-medium text-band-foreground/75 transition-colors hover:bg-band-hover hover:text-band-foreground',
                      'aria-[current=page]:bg-band-active aria-[current=page]:font-bold aria-[current=page]:text-band-foreground',
                      'before:absolute before:inset-y-2 before:-left-3 before:w-[3px] before:bg-band-accent before:opacity-0 aria-[current=page]:before:opacity-100',
                      'md:max-lg:justify-center md:max-lg:px-0',
                    )}
                  >
                    <Icon aria-hidden="true" className="size-[1.125rem] shrink-0" />
                    <span className="min-w-0 truncate md:max-lg:sr-only">{t(key)}</span>
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
