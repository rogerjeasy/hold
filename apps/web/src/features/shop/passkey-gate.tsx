import { ShieldCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { PasskeyButton } from '@/features/auth/passkey-button'
import { Link } from '@/i18n/navigation'
import { shopRoutes } from '@/lib/routes'

type PasskeyGateProps = {
  // True when this person must confirm with a passkey before changing the shop, and this session has not.
  needed: boolean
  hasPasskey: boolean
  email: string
  // The page to come back to after confirming.
  returnTo: string
  // What the confirmation is for, when it is not a change to prices, staff or PayPal.
  confirmBody?: string
  children: ReactNode
}

// Shows what changes the shop only once the person has proven it is them with a passkey. The server checks the same
// thing again on every change, so this is a courtesy, not the control.
export function PasskeyGate({ needed, hasPasskey, email, returnTo, confirmBody, children }: PasskeyGateProps) {
  const t = useTranslations('shop.passkeyGate')
  if (!needed) return children

  return (
    <section className="grid max-w-prose gap-4 border border-border-strong bg-card p-5 text-card-foreground">
      <div className="flex gap-3">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <h2 className="font-semibold">{t('title')}</h2>
          <p className="mt-1 text-muted-foreground">{hasPasskey ? (confirmBody ?? t('confirmBody')) : t('addBody')}</p>
        </div>
      </div>
      {hasPasskey ? (
        <PasskeyButton label={t('confirm')} email={email} returnTo={returnTo} variant="default" />
      ) : (
        <Link href={shopRoutes.security} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
          {t('add')}
        </Link>
      )}
    </section>
  )
}
