'use client'

import type { Person } from '@hold/db'
import { ExternalLink, LogOut } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { signOut } from '@/features/auth/actions'
import { Link } from '@/i18n/navigation'
import { routes } from '@/lib/routes'
import { initials } from './initials'

// Who is signed in, the way back to the public site, and signing out.
export function AccountMenu({ person }: { person: Person }) {
  const t = useTranslations('shell')
  const shop = useTranslations('shop')
  const locale = useLocale()
  const name = person.name ?? person.email

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('account', { name })}
        className="flex min-h-12 w-full min-w-0 items-center gap-3 rounded-lg px-2.5 text-left transition-colors hover:bg-band-hover md:max-lg:justify-center md:max-lg:px-0"
      >
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-band-active text-xs font-bold">
          {initials(name)}
        </span>
        <span className="min-w-0 flex-1 md:max-lg:sr-only">
          <span className="block truncate text-sm leading-tight font-semibold">{name}</span>
          <span className="block truncate text-xs text-band-muted">{person.email}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-64">
        <DropdownMenuLabel className="truncate text-sm font-normal text-muted-foreground">{person.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="min-h-11">
          <Link href={routes.home}>
            <ExternalLink aria-hidden="true" />
            {t('website')}
          </Link>
        </DropdownMenuItem>
        <form action={signOut}>
          <input type="hidden" name="locale" value={locale} />
          <DropdownMenuItem asChild className="min-h-11 w-full">
            <button type="submit">
              <LogOut aria-hidden="true" />
              {shop('signOut')}
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
