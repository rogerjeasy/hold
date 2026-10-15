import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { shopRoutes } from '@/lib/routes'

// Whether the shop's PayPal account is connected, and that it is the sandbox, so nobody takes a test for real money.
export function PayPalStatus({ connected }: { connected: boolean }) {
  const t = useTranslations('shell.paypal')
  const label = connected ? t('connected') : t('notConnected')

  return (
    <Link
      href={shopRoutes.paypal}
      title={label}
      className="flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-xs text-band-muted transition-colors hover:bg-band-hover hover:text-band-foreground md:max-lg:justify-center md:max-lg:px-0"
    >
      <span aria-hidden="true" className={connected ? 'size-2 shrink-0 rounded-full bg-band-success' : 'size-2 shrink-0 rounded-full border border-band-muted'} />
      <span className="min-w-0 truncate md:max-lg:sr-only">{label}</span>
    </Link>
  )
}
