import { CircleCheck } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { ConnectPayPalForm } from './connect-paypal-form'
import { PasskeyGate } from './passkey-gate'
import { ShopFrame } from './shop-frame'

type PayPalScreenProps = {
  shopName: string
  connectedAt: Date | undefined
  isOwner: boolean
  gate: { needed: boolean; hasPasskey: boolean; email: string }
}

export function PayPalScreen({ shopName, connectedAt, isOwner, gate }: PayPalScreenProps) {
  const t = useTranslations('shop.paypal')
  const format = useFormatter()

  return (
    <ShopFrame shopName={shopName} title={t('title')}>
      <div className="grid max-w-prose gap-8">
        <p className="text-lead text-muted-foreground">{t('lead')}</p>
        {connectedAt === undefined ? (
          <p className="font-semibold">{t('notConnected')}</p>
        ) : (
          <p className="flex gap-2 font-semibold">
            <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
            {t('isConnected', { date: format.dateTime(connectedAt, { dateStyle: 'medium' }) })}
          </p>
        )}
        {isOwner ? (
          <section className="grid gap-4">
            <h2 className="text-title">{connectedAt === undefined ? t('connectTitle') : t('reconnectTitle')}</h2>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>{t('steps.app')}</li>
              <li>{t('steps.copy')}</li>
              <li>{t('steps.paste')}</li>
            </ol>
            <PasskeyGate {...gate} returnTo="/shop/paypal">
              <ConnectPayPalForm />
            </PasskeyGate>
            <p className="text-sm text-muted-foreground">{t('sandboxOnly')}</p>
          </section>
        ) : (
          <p className="text-muted-foreground">{t('ownerOnly')}</p>
        )}
      </div>
    </ShopFrame>
  )
}
