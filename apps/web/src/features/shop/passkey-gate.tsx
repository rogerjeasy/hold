import { ArrowRight, KeyRound, LogOut, RotateCcw, ShieldCheck } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { buttonVariants } from '@/components/ui/button'
import { signOut } from '@/features/auth/actions'
import { PasskeyButton } from '@/features/auth/passkey-button'
import { Link } from '@/i18n/navigation'
import { routes, shopRoutes } from '@/lib/routes'

// What a page hands the gate, as server/passkey-gate.ts reads it.
export type PasskeyGateState = { readonly needed: boolean; readonly hasPasskey: boolean; readonly email: string; readonly demo?: boolean }

type PasskeyGateProps = {
  // True when this person must confirm with a passkey before changing the shop, and this session has not.
  needed: boolean
  hasPasskey: boolean
  email: string
  // The page to come back to after confirming.
  returnTo: string
  // What the passkey is for, when it is not a change to prices, staff or PayPal. Said whether or not this device has one.
  body?: string
  // A demo session's account. A judge's passkey stays in the browser that made it, so the next browser has none: where
  // the account has one, the gate names the ways out, a fresh demo or signing out.
  demo?: boolean
  // Inside a settings card the gate is drawn flat, as a tinted well, so it is not a card inside a card.
  inline?: boolean
  children: ReactNode
}

// The ways out of the gate on the demo, for a judge whose passkey is in another browser.
function DemoWayOut() {
  const t = useTranslations('shop.passkeyGate.demo')
  const locale = useLocale()
  return (
    <div className="grid gap-3 border-t border-border/70 px-5 py-4 md:px-6">
      <div>
        <p className="font-semibold">{t('title')}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{t('body')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={routes.signIn} className={buttonVariants({ variant: 'soft' })}>
          <RotateCcw aria-hidden="true" />
          {t('fresh')}
        </Link>
        <form action={signOut}>
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className={buttonVariants({ variant: 'ghost' })}>
            <LogOut aria-hidden="true" />
            {t('signOut')}
          </button>
        </form>
      </div>
    </div>
  )
}

// Shows what changes the shop only once the person has proven it is them with a passkey. The server checks the same
// thing again on every change, so this is a courtesy, not the control.
export function PasskeyGate({ needed, hasPasskey, email, returnTo, body, demo = false, inline = false, children }: PasskeyGateProps) {
  const t = useTranslations('shop.passkeyGate')
  if (!needed) return children

  return (
    <section className={inline ? 'max-w-2xl animate-rise overflow-clip rounded-xl border border-dashed border-border-strong/70 bg-muted/30' : 'surface max-w-2xl animate-rise overflow-clip'}>
      <div className="grid gap-5 p-5 md:p-6">
        <div className="flex gap-4">
          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="size-5" />
          </span>
          <div className="min-w-0 wrap-long-words">
            <h2 className="text-[1.0625rem] leading-tight font-extrabold tracking-tight">{t('title')}</h2>
            <p className="mt-1.5 text-muted-foreground">{body ?? t('body')}</p>
            <p className="mt-1.5 text-muted-foreground">{hasPasskey ? t('stays') : t('addFirst')}</p>
          </div>
        </div>
        {hasPasskey ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <PasskeyButton label={t('confirm')} email={email} returnTo={returnTo} variant="default" />
            {/* A person on a new device, or a judge on the shared demo account, has none here yet. */}
            <Link href={shopRoutes.security} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary underline-offset-4 hover:underline">
              {t('addHere')}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        ) : (
          <Link href={shopRoutes.security} className={buttonVariants({ className: 'justify-self-start' })}>
            <KeyRound aria-hidden="true" />
            {t('add')}
          </Link>
        )}
      </div>
      {demo && hasPasskey ? <DemoWayOut /> : null}
    </section>
  )
}
