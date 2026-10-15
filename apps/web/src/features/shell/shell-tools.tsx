import { LanguageSwitcher } from '@/features/site/language-switcher'
import { ThemeToggle } from '@/features/site/theme-toggle'
import { AccountMenu } from './account-menu'
import { PayPalStatus } from './paypal-status'
import type { ShellProps } from './shell-props'

const onBand = 'text-band-muted hover:bg-band-hover hover:text-band-foreground'

// The foot of the shop's menu: PayPal's state, the language and theme, and the account.
export function ShellTools({ person, paypalConnected }: Pick<ShellProps, 'person' | 'paypalConnected'>) {
  return (
    <div className="grid gap-1.5 border-t border-band-border pt-3">
      <PayPalStatus connected={paypalConnected} />
      <div className="flex items-center gap-1 px-1 md:max-lg:flex-col">
        <LanguageSwitcher className={onBand} />
        <ThemeToggle className={onBand} />
      </div>
      <AccountMenu person={person} />
    </div>
  )
}
