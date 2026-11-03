'use client'

import type { RentalHold } from '@hold/db'
import type { RentalState } from '@hold/domain'
import { CircleAlert, LoaderCircle, LockKeyhole, QrCode, ShieldCheck } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { StatusPill } from '@/components/ui/status-pill'
import { ActionMessage } from '@/features/shop/action-message'
import { useLookAgain } from '@/hooks/use-look-again'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'
import { HoldReason } from '@/features/trust/hold-reason'
import { askForHold } from './actions'
import { LinkCode } from './link-code'

type HoldPanelProps = {
  rentalId: string
  state: RentalState
  // The hold agreed at booking, shown before one is asked for.
  holdCents: number
  hold: RentalHold | undefined
  clock: ShopClock
}

// While staff wait at the counter for the renter to approve, the page looks again this often.
const LOOK_EVERY_MS = 3000
const LOOK_FOR_MS = 10 * 60_000

// The hold at pickup (architecture.md section 11.1): staff ask for it and show the code, the renter approves it on
// their own phone, and the panel shows it placed, with the two clocks PayPal set.
export function HoldPanel({ rentalId, state, holdCents, hold, clock }: HoldPanelProps) {
  const t = useTranslations('shop.rentals.hold')
  const locale = useLocale()
  const format = useShopFormat(clock)
  const [shown, ask, asking] = useActionState(askForHold, null)
  const amount = format.money(hold?.reservedCents ?? holdCents)
  const waiting = state === 'awaiting_hold' || (shown?.ok === true && hold?.state !== 'placed')
  useLookAgain(waiting, { everyMs: LOOK_EVERY_MS, forMs: LOOK_FOR_MS })

  if (hold?.state === 'placed') {
    return (
      <Panel title={t('title')} icon={ShieldCheck}>
        <div className="grid gap-4 px-4 py-5 md:px-5">
          <div className="grid animate-pop gap-1">
            <p className="text-figure tabular-nums wrap-long-words">{amount}</p>
            <p className="flex items-start gap-2 text-[0.9375rem] font-semibold">
              <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
              {t('placed', { amount })}
            </p>
          </div>
          {state === 'ready' ? <StatusPill tone="success" className="justify-self-start">{t('ready')}</StatusPill> : null}
          <HoldReason hold={hold} money={format.money} audience="staff" />
          {hold.orderId === null ? null : <p className="rounded-xl bg-warning/10 px-3 py-2.5 text-[0.9375rem] text-pretty">{t('replacing')}</p>}
          {hold.assuredUntil === null || hold.validUntil === null ? null : (
            <dl className="grid grid-cols-2 gap-2">
              <div className="min-w-0 rounded-xl bg-muted/70 px-3 py-2.5">
                <dt className="text-xs text-muted-foreground">{t('assuredUntil')}</dt>
                <dd className="figures mt-0.5 font-semibold">{format.day(hold.assuredUntil)}</dd>
              </div>
              <div className="min-w-0 rounded-xl bg-muted/70 px-3 py-2.5">
                <dt className="text-xs text-muted-foreground">{t('validUntil')}</dt>
                <dd className="figures mt-0.5 font-semibold">{format.day(hold.validUntil)}</dd>
              </div>
            </dl>
          )}
        </div>
      </Panel>
    )
  }

  return (
    <Panel title={t('title')} icon={ShieldCheck}>
      <div className="grid gap-4 px-4 py-5 md:px-5">
        {waiting ? (
          <p role="status" className="flex items-start gap-2.5 rounded-xl bg-primary/8 px-3 py-2.5 font-medium">
            <LoaderCircle aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 animate-spin text-primary" />
            {t('waiting', { amount })}
          </p>
        ) : (
          <p className="text-pretty text-muted-foreground">{t('body', { amount })}</p>
        )}
        {hold === undefined ? null : <HoldReason hold={hold} money={format.money} audience="staff" />}
        {hold?.placementFailure === null || hold?.placementFailure === undefined ? null : (
          <p role="alert" className="flex gap-1.5 text-[0.9375rem] text-destructive">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
            {t('declined')}
          </p>
        )}
        <form action={ask}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="rentalId" value={rentalId} />
          <Button type="submit" variant={state === 'awaiting_hold' || shown?.ok === true ? 'outline' : 'default'} disabled={asking} className="max-sm:w-full">
            <QrCode aria-hidden="true" />
            {asking ? t('asking') : state === 'awaiting_hold' || shown?.ok === true ? t('again') : t('ask')}
          </Button>
        </form>
        {shown?.ok === true ? <LinkCode url={shown.value.url} qr={shown.value.qr} scan={t('scan')} /> : <ActionMessage result={shown} success="" results="shop.rentals.results" />}
      </div>
    </Panel>
  )
}
