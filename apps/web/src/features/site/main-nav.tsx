'use client'

import { cn } from 'cn'
import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import { navItems } from './nav-items'

export function MainNav({ className }: { className?: string }) {
  const t = useTranslations('nav')
  const pathname = usePathname()

  return (
    <nav aria-label={t('main')} className={className}>
      <ul className="flex items-center gap-0.5">
        {navItems.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={pathname === item.href ? 'page' : undefined}
              className={cn(
                'relative inline-flex min-h-11 items-center rounded-full px-3 text-[0.9375rem] whitespace-nowrap text-muted-foreground transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground',
                // The current page is marked twice: by weight and a soft pill, and by a dot in the accent beneath it.
                'aria-[current=page]:bg-foreground/6 aria-[current=page]:font-semibold aria-[current=page]:text-foreground',
                'after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary after:opacity-0 after:transition-opacity aria-[current=page]:after:opacity-100',
              )}
            >
              {t(item.key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
