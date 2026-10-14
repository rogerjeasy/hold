import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { routes } from '@/lib/routes'
import { AccountLink } from './account-link'
import { LanguageSwitcher } from './language-switcher'
import { Logo } from './logo'
import { MainNav } from './main-nav'
import { MobileMenu } from './mobile-menu'
import { ThemeToggle } from './theme-toggle'

export function SiteHeader() {
  const t = useTranslations('nav')

  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="mx-auto flex max-w-page items-center gap-2 py-1.5 pr-2 pl-4 md:px-8 lg:gap-4 lg:px-10 lg:py-3">
        <Link href={routes.home} aria-label={t('home')} className="inline-flex min-h-11 items-center">
          <Logo />
        </Link>
        <MainNav className="hidden lg:block" />
        <div className="ml-auto flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
          <AccountLink />
          <Button asChild className="ml-1 hidden xl:inline-flex">
            <Link href={routes.demo}>{t('demo')}</Link>
          </Button>
          <MobileMenu className="lg:hidden" />
        </div>
      </div>
    </header>
  )
}
