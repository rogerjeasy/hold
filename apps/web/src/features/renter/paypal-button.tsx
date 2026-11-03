'use client'

import { useLocale, useTranslations } from 'next-intl'
import { createElement, useActionState, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { RenterActionResult } from '@/server/renter-access'
import type { PaymentSession, PayPalCheckout } from './paypal-sdk'
import { paypalSession } from './paypal-sdk'
import { RenterMessage } from './renter-message'

// What starting a payment returns: PayPal's page to approve on, the order, and where PayPal's page would return to.
type Started = { readonly approvalUrl: string; readonly orderId: string; readonly returnUrl: string }
type Start = (previous: unknown, data: FormData) => Promise<RenterActionResult<Started>>

type PayPalButtonProps = {
  token: string
  start: Start
  texts: { readonly go: string; readonly going: string; readonly agree: string }
  // The shop's PayPal app, when it is known: then PayPal's own button opens PayPal over the page.
  checkout?: PayPalCheckout
  navigate?: (url: string) => void
}

const goTo = (url: string) => {
  window.location.assign(url)
}

// Starts something the renter approves in PayPal, such as the fee or the hold. No amount is sent: the server reads it
// from the rental. With the shop's PayPal known, PayPal's own button opens PayPal over the page and, once the renter
// approves, returns to the page PayPal's redirect would have; otherwise the renter goes to PayPal's page to approve.
export function PayPalButton({ token, start, texts, checkout, navigate = goTo }: PayPalButtonProps) {
  const t = useTranslations('renter')
  const locale = useLocale()
  const form = () => {
    const data = new FormData()
    data.set('token', token)
    data.set('locale', locale)
    return data
  }
  const [result, go, pending] = useActionState(start, null)
  const [session, setSession] = useState<PaymentSession | undefined>(undefined)
  const [cancelled, setCancelled] = useState(false)
  const [refused, setRefused] = useState<RenterActionResult<Started> | null>(null)
  const startedRef = useRef<Started | undefined>(undefined)

  useEffect(() => {
    if (result?.ok === true) navigate(result.value.approvalUrl)
  }, [result, navigate])

  useEffect(() => {
    if (checkout === undefined) return
    let live = true
    void paypalSession(checkout, locale, {
      onApprove: () => {
        const started = startedRef.current
        if (started !== undefined) navigate(started.returnUrl)
        return Promise.resolve()
      },
      onCancel: () => {
        setCancelled(true)
      },
      // PayPal's button could not finish: its own page still can.
      onError: () => {
        const started = startedRef.current
        if (started !== undefined) navigate(started.approvalUrl)
      },
    }).then((made) => {
      if (live) setSession(made)
    })
    return () => {
      live = false
    }
  }, [checkout, locale, navigate])

  // The order is asked for at once, not awaited first, as PayPal's button must open while the click still counts.
  const order = async () => {
    setCancelled(false)
    const started = await start(null, form())
    if (!started.ok) {
      setRefused(started)
      throw new Error(started.failure)
    }
    startedRef.current = started.value
    return { orderId: started.value.orderId }
  }

  if (session !== undefined) {
    return (
      <div className="grid gap-3">
        {createElement('paypal-button', {
          type: 'pay',
          class: 'block min-h-12 w-full max-w-sm',
          onClick: () => {
            session.start({ presentationMode: 'auto' }, order()).catch(() => undefined)
          },
        })}
        <p className="text-sm text-muted-foreground">{texts.agree}</p>
        {cancelled ? <p role="status">{t('paypalCancelled')}</p> : null}
        <RenterMessage result={refused} />
      </div>
    )
  }

  return (
    <form action={go} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" disabled={pending || result?.ok === true} className="min-h-12 justify-self-start whitespace-normal">
        {pending || result?.ok === true ? texts.going : texts.go}
      </Button>
      <p className="text-sm text-muted-foreground">{texts.agree}</p>
      <RenterMessage result={result?.ok === true ? null : result} />
    </form>
  )
}
