'use client'

import { CircleCheck, Clock, LoaderCircle } from 'lucide-react'
import { useLocale } from 'next-intl'
import { startTransition, useActionState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useLookAgain } from '@/hooks/use-look-again'
import { Link } from '@/i18n/navigation'
import type { RenterActionResult } from '@/server/renter-access'
import { RenterMessage } from './renter-message'

type Confirm<Output> = (previous: unknown, data: FormData) => Promise<RenterActionResult<Output>>

type PayPalReturnProps<Output> = {
  token: string
  orderId: string
  shopName: string
  // What the server last read: the page is drawn again while the worker acts, until it says done.
  done: boolean
  confirm: Confirm<Output>
  // True while the worker is still acting on what the renter approved.
  stillWorking: (output: Output) => boolean
  texts: { readonly title: string; readonly checking: string; readonly done: string; readonly retry: string }
  // Where the renter goes when it is done, or when they should approve again.
  next: { readonly href: string; readonly label: string }
  // Where the renter goes after a refusal, when trying the same confirmation again would not help.
  afterRefusal?: { readonly href: string; readonly label: string; readonly reasons: readonly string[] }
  // Refusals this page words its own way.
  wording?: Readonly<Record<string, string>>
  // PayPal holds what the renter approved for review, which may take days: said plainly, and not looked at again.
  held?: { readonly when: (output: Output) => boolean; readonly text: string }
}

// Where PayPal sends the renter back. Arriving changes nothing: the page then asks, once, by a POST, for what the
// renter approved to be carried out, and looks again while the worker does it.
export function PayPalReturn<Output>({ token, orderId, shopName, done, confirm, stillWorking, texts, next, afterRefusal, wording, held }: PayPalReturnProps<Output>) {
  const locale = useLocale()
  const [result, send, pending] = useActionState(confirm, null)
  const asked = useRef(done)
  const working = result?.ok === true && stillWorking(result.value) && !done
  const ask = () => {
    const data = new FormData()
    data.set('token', token)
    data.set('orderId', orderId)
    data.set('locale', locale)
    startTransition(() => {
      send(data)
    })
  }
  useEffect(() => {
    if (asked.current) return
    asked.current = true
    ask()
  })
  useLookAgain(working)
  const reviewing = !done && result?.ok === true && held?.when(result.value) === true
  const finished = !reviewing && (done || (result?.ok === true && !stillWorking(result.value)))
  const refusedFor = result?.ok === false && result.failure === 'refused' ? result.reason : undefined
  const elsewhere = afterRefusal !== undefined && refusedFor !== undefined && afterRefusal.reasons.includes(refusedFor) ? afterRefusal : undefined

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6 px-4 py-12 md:px-8">
      <p className="label text-xs text-muted-foreground">{shopName}</p>
      <h1 className="text-page-title text-balance">{texts.title}</h1>
      {reviewing ? (
        <div className="grid gap-4">
          <p role="status" className="flex gap-2 text-pretty">
            <Clock aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            {held.text}
          </p>
          <Link href={next.href} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
            {next.label}
          </Link>
        </div>
      ) : finished ? (
        <div className="grid gap-4">
          <p role="status" className="flex items-center gap-2 text-lg font-semibold">
            <CircleCheck aria-hidden="true" className="size-5 shrink-0 text-primary" />
            {texts.done}
          </p>
          <Link href={next.href} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
            {next.label}
          </Link>
        </div>
      ) : result === null || pending || working ? (
        <p role="status" className="flex items-center gap-2 text-muted-foreground">
          <LoaderCircle aria-hidden="true" className="size-5 shrink-0 animate-spin" />
          {texts.checking}
        </p>
      ) : (
        <div className="grid gap-4">
          <RenterMessage result={result} wording={wording} />
          <div className="flex flex-wrap gap-2">
            {elsewhere === undefined ? (
              <Button type="button" onClick={ask}>
                {texts.retry}
              </Button>
            ) : (
              <Button asChild>
                <Link href={elsewhere.href}>{elsewhere.label}</Link>
              </Button>
            )}
            <Link href={next.href} className="inline-flex min-h-11 items-center px-2 font-semibold underline underline-offset-4">
              {next.label}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
