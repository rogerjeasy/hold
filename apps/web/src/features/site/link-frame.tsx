import type { ReactNode } from 'react'
import { LanguageSwitcher } from './language-switcher'
import { Logo } from './logo'
import { ThemeToggle } from './theme-toggle'

// The frame of the pages a renter opens: their own link and a shop's page. Only the wordmark, the language and the
// theme: a renter came to rent, not to read about Hold.
export function LinkFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-b bg-background">
        <div className="mx-auto flex min-h-16 w-full max-w-5xl items-center justify-between gap-3 px-4 md:px-8">
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
    </>
  )
}
