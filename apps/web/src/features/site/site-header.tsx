import { cn } from 'cn'
import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { routes } from '@/lib/routes'
import { AccountLink } from './account-link'
import { LanguageSwitcher } from './language-switcher'
import { Logo } from './logo'
import { MainNav } from './main-nav'
import { MobileMenu } from './mobile-menu'
import motion from './motion.module.css'
import { ThemeToggle } from './theme-toggle'

// A frosted bar over the page. Its edge shows once the page moves under it, where the browser can tell.
export function SiteHeader() {
  const t = useTranslations('nav')

  return (
    <header className={cn('glass sticky top-0 z-40 border-b border-border/70 shadow-xs', motion.headerEdge)}>
      <div className="mx-auto flex min-h-15 max-w-page items-center gap-2 py-1.5 pr-2 pl-4 md:px-8 lg:min-h-18 lg:gap-6 lg:px-10">
        <Link href={routes.home} aria-label={t('home')} className="inline-flex min-h-11 items-center rounded-lg transition-opacity hover:opacity-80">
          <Logo />
        </Link>
        <MainNav className="hidden lg:block" />
        <div className="ml-auto flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
          <AccountLink />
          <Button asChild className="group ml-1 hidden xl:inline-flex">
            <Link href={routes.demo}>
              {t('demo')}
              <ArrowRight aria-hidden="true" className="transition-transform duration-300 ease-spring group-hover:translate-x-0.5" />
            </Link>
          </Button>
          <MobileMenu className="lg:hidden" />
        </div>
      </div>
    </header>
  )
}
