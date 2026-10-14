import { KeyRound } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import type { Passkey } from '@hold/auth'
import { AddPasskey } from '@/features/auth/add-passkey'
import { PasskeyGate } from './passkey-gate'
import { ShopFrame } from './shop-frame'

// The person's passkeys, and a way to add one on this device.
type SecurityScreenProps = {
  shopName: string
  passkeys: readonly Passkey[] | undefined
  required: boolean
  // True when this session was proven by an emailed code: a person with a passkey confirms with it before adding more.
  emailCodeSession: boolean
  email: string
}

export function SecurityScreen({ shopName, passkeys, required, emailCodeSession, email }: SecurityScreenProps) {
  const t = useTranslations('shop.security')
  const format = useFormatter()

  return (
    <ShopFrame shopName={shopName} current="security" title={t('title')}>
      <div className="grid max-w-prose gap-6">
        <p className="text-lead text-muted-foreground">{required ? t('leadRequired') : t('lead')}</p>
        {passkeys === undefined ? (
          <p role="alert" className="text-destructive">
            {t('unavailable')}
          </p>
        ) : passkeys.length === 0 ? (
          <p className="font-semibold">{t('none')}</p>
        ) : (
          <ul className="border-t">
            {passkeys.map((passkey, index) => (
              <li key={passkey.id} className="flex items-center gap-3 border-b py-4">
                <KeyRound aria-hidden="true" className="size-5 shrink-0 text-primary" />
                <span className="min-w-0 wrap-long-words">
                  {passkey.name ?? t('unnamed', { number: index + 1 })}
                  {passkey.createdAt === undefined ? null : (
                    <span className="block text-sm text-muted-foreground">{t('added', { date: format.dateTime(passkey.createdAt, { dateStyle: 'medium' }) })}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <PasskeyGate
          needed={emailCodeSession && (passkeys?.length ?? 0) > 0}
          hasPasskey
          email={email}
          returnTo="/shop/security"
          confirmBody={t('confirmToAdd')}
        >
          <AddPasskey />
        </PasskeyGate>
        <p className="text-sm text-muted-foreground">{t('how')}</p>
      </div>
    </ShopFrame>
  )
}
