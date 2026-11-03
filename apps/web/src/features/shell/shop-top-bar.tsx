import { useTranslations } from 'next-intl'
import { Logo } from '@/features/site/logo'
import { Link } from '@/i18n/navigation'
import { shopRoutes } from '@/lib/routes'
import { CommandPalette } from './command-palette'
import type { ShellProps } from './shell-props'
import { NewRentalLink } from './new-rental-link'

// The bar over every shop page. Below lg it carries the logo and the shop's name on the dark band; from lg it sits on
// the page's own sheet, frosted, with the jump-to search and a new rental at hand. One palette serves both, so its
// keyboard shortcut is heard once.
export function ShopTopBar({ shop, role }: ShellProps) {
  const t = useTranslations('shell')

  return (
    <header className="sticky top-0 z-40 flex min-h-14 items-center gap-2 bg-band pr-2 pl-4 text-band-foreground lg:glass lg:min-h-16 lg:rounded-t-2xl lg:border-b lg:border-border/60 lg:px-8 lg:text-foreground xl:px-10">
      <Link href={shopRoutes.home} aria-label={t('home', { shop: shop.name })} className="inline-flex min-h-11 items-center lg:hidden">
        <Logo />
      </Link>
      <p className="ml-1 min-w-0 flex-1 truncate text-sm font-semibold text-band-foreground/70 lg:hidden">{shop.name}</p>
      <CommandPalette
        role={role}
        className="max-lg:border-band-border max-lg:bg-band-hover max-lg:text-band-foreground max-lg:shadow-none max-lg:hover:border-band-muted max-sm:w-11 max-sm:justify-center max-sm:px-0 sm:w-56 lg:w-full lg:max-w-sm [&>span]:max-sm:sr-only"
      />
      {role === 'read_only' ? null : (
        <div className="ml-auto hidden lg:block">
          <NewRentalLink />
        </div>
      )}
    </header>
  )
}
