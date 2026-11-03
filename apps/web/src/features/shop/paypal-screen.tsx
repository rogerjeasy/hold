import { cn } from 'cn'
import { BellRing, Link2, PlugZap, ShieldCheck, Wallet } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { StatusPill } from '@/components/ui/status-pill'
import { ConnectPayPalForm } from './connect-paypal-form'
import { TurnOnNotifications } from './turn-on-notifications'
import { PasskeyGate } from './passkey-gate'
import type { PasskeyGateState } from './passkey-gate'
import { ShopFrame } from './shop-frame'

type PayPalScreenProps = {
  shopName: string
  connectedAt: Date | undefined
  // Whether PayPal sends this shop's events to Hold. `demo`: a demo shop, which shares the demo's sandbox app and so
  // never has notifications of its own (architecture.md section 20.3).
  // demo: a demo shop with no shared webhook yet; demo_on: one whose events come through the shared app's address.
  notifications: 'on' | 'off' | 'demo' | 'demo_on'
  isOwner: boolean
  gate: PasskeyGateState
}

const NOTICES = { on: 'notificationsOn', off: 'notificationsOff', demo: 'notificationsDemo', demo_on: 'notificationsDemoOn' } as const

// Where the shop's PayPal stands, at a glance: connected or not, since when, and whether PayPal tells Hold about each
// payment. Turning notifications on waits for the passkey like every other change here.
function ConnectionCard({ connectedAt, notifications, offerTurnOn }: { connectedAt: Date | undefined; notifications: PayPalScreenProps['notifications']; offerTurnOn: boolean }) {
  const t = useTranslations('shop.paypal')
  const format = useFormatter()
  const connected = connectedAt !== undefined
  return (
    <section aria-label={t('title')} className="surface overflow-clip">
      <div className="relative isolate flex flex-wrap items-center gap-x-5 gap-y-4 p-5 md:p-6">
        <div aria-hidden="true" className="absolute inset-0 -z-10 dot-grid mask-l-from-0% mask-l-to-60% opacity-60" />
        <span aria-hidden="true" className={cn('grid size-14 shrink-0 place-items-center rounded-2xl', connected ? 'bg-success/12 text-success' : 'bg-muted text-muted-foreground')}>
          <Wallet className="size-6" />
        </span>
        <div className="min-w-0 flex-[1_1_16rem]">
          <StatusPill tone={connected ? 'success' : 'neutral'} live={connected}>{connected ? t('status.connected') : t('status.notConnected')}</StatusPill>
          <p className="mt-2 text-[1.375rem] leading-tight font-extrabold tracking-tight">
            {connected ? t('isConnected', { date: format.dateTime(connectedAt, { dateStyle: 'medium' }) }) : t('notConnected')}
          </p>
        </div>
      </div>
      {connected ? (
        <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 gap-y-3 border-t border-border/70 bg-muted/30 px-5 py-4 md:px-6">
          <span aria-hidden="true" className={cn('grid size-9 place-items-center rounded-xl', notifications === 'off' ? 'bg-warning/14 text-warning' : 'bg-primary/10 text-primary')}>
            <BellRing className="size-4" />
          </span>
          <p className="self-center">{t(NOTICES[notifications])}</p>
          {offerTurnOn ? <div className="col-start-2"><TurnOnNotifications /></div> : null}
        </div>
      ) : null}
    </section>
  )
}

export function PayPalScreen({ shopName, connectedAt, notifications, isOwner, gate }: PayPalScreenProps) {
  const t = useTranslations('shop.paypal')
  const steps = [t('steps.app'), t('steps.copy'), t('steps.paste')]

  return (
    <ShopFrame shopName={shopName} title={t('title')} description={t('lead')}>
      <div className="grid max-w-2xl min-w-0 gap-6">
        <ConnectionCard connectedAt={connectedAt} notifications={notifications} offerTurnOn={isOwner && notifications === 'off' && !gate.needed} />
        {/* One gate for both owner changes on the page, instead of a card inside each. */}
        {isOwner && gate.needed ? <PasskeyGate {...gate} returnTo="/shop/paypal">{null}</PasskeyGate> : null}
        {isOwner ? (
          <Panel title={connectedAt === undefined ? t('connectTitle') : t('reconnectTitle')} icon={connectedAt === undefined ? PlugZap : Link2}>
            <ol className="grid gap-3 border-b border-border/70 px-4 py-4 md:px-5">
              {steps.map((step, index) => (
                <li key={step} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3">
                  <span aria-hidden="true" className="figures grid size-7 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{index + 1}</span>
                  <span className="self-center text-muted-foreground wrap-long-words">{step}</span>
                </li>
              ))}
            </ol>
            {gate.needed ? null : <div className="px-4 py-5 md:px-5"><ConnectPayPalForm /></div>}
            <p className="flex gap-2 border-t border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground md:px-5">
              <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {t('sandboxOnly')}
            </p>
          </Panel>
        ) : (
          <p className="text-muted-foreground">{t('ownerOnly')}</p>
        )}
      </div>
    </ShopFrame>
  )
}
