'use client'

import { Globe } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { getPathname, usePathname } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'

export function LanguageSwitcher() {
  const t = useTranslations('language')
  const current = useLocale()
  const pathname = usePathname()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" aria-label={t('label')} className="px-2.5">
          <Globe aria-hidden="true" />
          <span>{current.toUpperCase()}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {routing.locales.map((locale) => (
          <DropdownMenuItem key={locale} asChild className="min-h-11 px-3 text-[0.9375rem]">
            {/*
              A plain link, so the browser loads the page afresh. Each language has its own root layout, and a
              client-side move between them left the router prefetching pages against the old one.
              The prefix is always written, English included, so the proxy records the choice before redirecting.
            */}
            <a
              href={getPathname({ href: pathname, locale, forcePrefix: true })}
              lang={locale}
              hrefLang={locale}
              aria-current={locale === current ? 'true' : undefined}
              className="aria-[current=true]:font-semibold"
            >
              {t(locale)}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
