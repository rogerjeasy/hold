import type { ReactNode } from 'react'
import { LanguageSwitcher } from './language-switcher'
import { LegalLinks } from './legal-links'
import { Logo } from './logo'
import { ThemeToggle } from './theme-toggle'

// The frame of the pages a renter opens: their own link and a shop's page. Only the wordmark, the language and the
// theme, and below, the privacy notice and the terms: a renter came to rent, not to read about Hold. The bar stays on
// top while the page moves under it, as an app's does, and leaves the safe area of a phone's notch alone.
export function LinkFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="glass sticky top-0 z-30 border-b border-border/60 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex min-h-14 w-full max-w-5xl items-center justify-between gap-3 px-4 md:min-h-16 md:px-8">
          <Logo />
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-border/60 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto w-full max-w-5xl px-4 text-sm text-muted-foreground md:px-8">
          <LegalLinks />
        </div>
      </footer>
    </>
  )
}
