'use client'

import { CircleCheck, LoaderCircle } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { startTransition, useActionState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { linkRoutes } from '@/lib/routes'
import { confirmFee } from './actions'
import { RenterMessage } from './renter-message'

type PaidScreenProps = { token: string; orderId: string; shopName: string }

// Where PayPal sends the renter back. Arriving changes nothing: the page then asks, once, by a POST, for the payment
// to be confirmed with PayPal, which is what books the rental.
export function PaidScreen({ token, orderId, shopName }: PaidScreenProps) {
  const t = useTranslations('renter.paid')
  const locale = useLocale()
  const [result, confirm, pending] = useActionState(confirmFee, null)
  const asked = useRef(false)
  const send = () => {
    const data = new FormData()
    data.set('token', token)
    data.set('orderId', orderId)
    data.set('locale', locale)
    startTransition(() => {
      confirm(data)
    })
  }
  useEffect(() => {
    if (asked.current) return
    asked.current = true
    send()
  })

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6 px-4 py-12 md:px-8">
      <p className="label text-xs text-muted-foreground">{shopName}</p>
      <h1 className="text-page-title text-balance">{t('title')}</h1>
      {result?.ok === true ? (
        <div className="grid gap-4">
          <p role="status" className="flex items-center gap-2 text-lg font-semibold">
            <CircleCheck aria-hidden="true" className="size-5 text-primary" />
            {t('done')}
          </p>
          <Link href={`${linkRoutes.renter}/${token}`} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
            {t('back')}
          </Link>
        </div>
      ) : result === null || pending ? (
        <p role="status" className="flex items-center gap-2 text-muted-foreground">
          <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
          {t('checking')}
        </p>
      ) : (
        <div className="grid gap-4">
          <RenterMessage result={result} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={send}>
              {t('retry')}
            </Button>
            <Link href={`${linkRoutes.renter}/${token}`} className="inline-flex min-h-11 items-center px-2 font-semibold underline underline-offset-4">
              {t('back')}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
