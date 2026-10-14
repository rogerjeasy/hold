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
      <ul className="flex items-center">
        {navItems.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={pathname === item.href ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center px-2.5 text-[0.9375rem] whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                'aria-[current=page]:font-semibold aria-[current=page]:text-foreground aria-[current=page]:underline aria-[current=page]:decoration-primary aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-8',
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
