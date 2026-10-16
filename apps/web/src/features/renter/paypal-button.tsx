'use client'

import { useLocale } from 'next-intl'
import { useActionState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import type { RenterActionResult } from '@/server/renter-access'
import { RenterMessage } from './renter-message'

type Start = (previous: unknown, data: FormData) => Promise<RenterActionResult<{ readonly approvalUrl: string }>>

type PayPalButtonProps = {
  token: string
  start: Start
  texts: { readonly go: string; readonly going: string; readonly agree: string }
}

// Starts something the renter approves in PayPal, such as the fee or the hold, and sends them there to approve it
// themselves. No amount is sent: the server reads it from the rental.
export function PayPalButton({ token, start, texts }: PayPalButtonProps) {
  const locale = useLocale()
  const [result, go, pending] = useActionState(start, null)
  useEffect(() => {
    if (result?.ok === true) window.location.assign(result.value.approvalUrl)
  }, [result])
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
