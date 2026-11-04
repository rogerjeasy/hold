import { Fingerprint, KeyRound, ShieldCheck } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import type { Passkey } from '@hold/auth'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { AddPasskey } from '@/features/auth/add-passkey'
import { PasskeyGate } from './passkey-gate'
import { ShopFrame } from './shop-frame'

// The person's passkeys, and a way to add one on this device.
type SecurityScreenProps = {
  shopName: string
  passkeys: readonly Passkey[] | undefined
  required: boolean
  // True when a passkey proved this session. Otherwise a person who has one confirms with it before adding more, as
  // the server requires of every account, a demo session's included.
  confirmedByPasskey: boolean
  email: string
  // A demo session's account, whose passkey stays in the browser that made it: the gate names a fresh demo as the way out.
  demo: boolean
}

export function SecurityScreen({ shopName, passkeys, required, confirmedByPasskey, email, demo }: SecurityScreenProps) {
  const t = useTranslations('shop.security')
  const format = useFormatter()
  const gated = !confirmedByPasskey && (passkeys?.length ?? 0) > 0

  return (
    <ShopFrame shopName={shopName} title={t('title')} description={required ? t('leadRequired') : t('lead')}>
      <div className="grid max-w-2xl min-w-0 gap-6">
        {passkeys === undefined ? (
          <>
            <Notice announced tone="destructive" title={t('title')} body={t('unavailable')} />
            <AddPasskey />
          </>
        ) : (
          <Panel title={t('listTitle')} icon={Fingerprint} aside={passkeys.length === 0 ? null : <span className="figures text-sm text-muted-foreground">{passkeys.length}</span>}>
            {passkeys.length === 0 ? (
              <p className="px-4 py-5 font-semibold md:px-5">{t('none')}</p>
            ) : (
              <ul className="stagger">
                {passkeys.map((passkey, index) => (
                  <li key={passkey.id} className="flex items-center gap-3 border-b border-border/70 px-4 py-3.5 last:border-b-0 md:px-5">
                    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-success/12 text-success">
                      <KeyRound className="size-4.5" />
                    </span>
                    <span className="min-w-0 font-semibold wrap-long-words">
                      {passkey.name ?? t('unnamed', { number: index + 1 })}
                      {passkey.createdAt === undefined ? null : (
                        <span className="block text-sm font-normal text-muted-foreground">{t('added', { date: format.dateTime(passkey.createdAt, { dateStyle: 'medium' }) })}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {gated ? null : <div className="border-t border-border/70 px-4 py-4 md:px-5"><AddPasskey /></div>}
          </Panel>
        )}
        {/* The gate is a card of its own, so it stands below the list rather than inside it. */}
        {gated ? <PasskeyGate needed hasPasskey email={email} demo={demo} offerAdd={false} returnTo="/shop/security" body={t('confirmToAdd')}>{null}</PasskeyGate> : null}
        <p className="flex gap-2.5 text-sm text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
          {t('how')}
        </p>
      </div>
    </ShopFrame>
  )
}
