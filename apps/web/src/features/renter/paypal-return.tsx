'use client'

import { ArrowRight, CircleCheck, Clock, LoaderCircle } from 'lucide-react'
import { useLocale } from 'next-intl'
import { startTransition, useActionState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useLookAgain } from '@/hooks/use-look-again'
import { Link } from '@/i18n/navigation'
import type { RenterActionResult } from '@/server/renter-access'
import { RenterMessage } from './renter-message'
import { RenterHead, RenterPage } from './renter-page'

const nextLink = 'inline-flex min-h-11 items-center px-2 font-semibold underline underline-offset-4'

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
    <RenterPage className="max-w-xl">
      <RenterHead shopName={shopName} title={texts.title} />
      <section className="surface grid min-w-0 justify-items-center gap-5 px-5 py-10 text-center md:px-8 md:py-12">
        {reviewing ? (
          <>
            <span aria-hidden="true" className="grid size-16 place-items-center rounded-full bg-warning/12 text-warning">
              <Clock className="size-7" />
            </span>
            <p role="status" className="max-w-prose text-pretty">{held.text}</p>
            <Link href={next.href} className={nextLink}>{next.label}</Link>
          </>
        ) : finished ? (
          <>
            <span aria-hidden="true" className="grid size-16 animate-pop place-items-center rounded-full bg-success/12 text-success">
              <CircleCheck className="size-8" />
            </span>
            <p role="status" className="max-w-prose animate-rise text-xl leading-snug font-extrabold tracking-tight text-balance">{texts.done}</p>
            <Button asChild className="min-h-12 w-full sm:w-auto">
              <Link href={next.href}>{next.label}<ArrowRight aria-hidden="true" /></Link>
            </Button>
          </>
        ) : result === null || pending || working ? (
          <>
            <span aria-hidden="true" className="grid size-16 animate-pulse-ring place-items-center rounded-full bg-primary/10 text-primary">
              <LoaderCircle className="size-7 animate-spin" />
            </span>
            <p role="status" className="text-muted-foreground">{texts.checking}</p>
          </>
        ) : (
          <>
            <RenterMessage result={result} wording={wording} />
            <div className="flex flex-wrap items-center justify-center gap-2">
              {elsewhere === undefined ? (
                <Button type="button" onClick={ask} className="min-h-12">
                  {texts.retry}
                </Button>
              ) : (
                <Button asChild className="min-h-12">
                  <Link href={elsewhere.href}>{elsewhere.label}</Link>
                </Button>
              )}
              <Link href={next.href} className={nextLink}>{next.label}</Link>
            </div>
          </>
        )}
      </section>
    </RenterPage>
  )
}
