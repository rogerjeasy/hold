'use client'

import type { RentalHold } from '@hold/db'
import type { RentalState } from '@hold/domain'
import { CircleAlert, CircleCheck, LoaderCircle, QrCode } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { ActionMessage } from '@/features/shop/action-message'
import { useLookAgain } from '@/hooks/use-look-again'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'
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
      <Panel title={t('title')}>
        <div className="grid gap-3 px-4 py-4 md:px-5">
          <p className="flex items-start gap-2 font-semibold">
            <CircleCheck aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-primary" />
            {t('placed', { amount })}
          </p>
          {state === 'ready' ? <p className="text-muted-foreground">{t('ready')}</p> : null}
          {hold.orderId === null ? null : <p className="border-l-2 border-primary pl-3">{t('replacing')}</p>}
          {hold.assuredUntil === null || hold.validUntil === null ? null : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{t('assuredUntil')}</dt>
              <dd className="figures">{format.day(hold.assuredUntil)}</dd>
              <dt className="text-muted-foreground">{t('validUntil')}</dt>
              <dd className="figures">{format.day(hold.validUntil)}</dd>
            </dl>
          )}
        </div>
      </Panel>
    )
  }

  return (
    <Panel title={t('title')}>
      <div className="grid gap-4 px-4 py-4 md:px-5">
        {waiting ? (
          <p role="status" className="flex items-start gap-2">
            <LoaderCircle aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 animate-spin text-muted-foreground" />
            {t('waiting', { amount })}
          </p>
        ) : (
          <p className="text-muted-foreground">{t('body', { amount })}</p>
        )}
        {hold?.placementFailure === null || hold?.placementFailure === undefined ? null : (
          <p role="alert" className="flex gap-1.5 text-[0.9375rem] text-destructive">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
            {t('declined')}
          </p>
        )}
        <form action={ask}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="rentalId" value={rentalId} />
          <Button type="submit" disabled={asking} className="whitespace-normal">
            <QrCode aria-hidden="true" />
            {asking ? t('asking') : state === 'awaiting_hold' || shown?.ok === true ? t('again') : t('ask')}
          </Button>
        </form>
        {shown?.ok === true ? <LinkCode url={shown.value.url} qr={shown.value.qr} scan={t('scan')} /> : <ActionMessage result={shown} success="" results="shop.rentals.results" />}
      </div>
    </Panel>
  )
}
