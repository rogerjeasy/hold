'use client'

import { CircleAlert, CircleCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ShopActionResult } from '@/server/shop-access'

// A feature whose refusals have their own words. Reasons it does not word, such as a missing passkey, are worded once
// in shop.results.
type Results = 'shop.results' | 'trust.ladder.results' | 'shop.items.results' | 'shop.rentals.results' | 'shop.handover.results' | 'shop.returns.results' | 'claim.results'

// What a shop action answered, in plain words. A refusal can name a row of the form, as "amount_invalid:2".
export function ActionMessage({ result, success, results = 'shop.results' }: { result: ShopActionResult<unknown> | null; success: string; results?: Results }) {
  const own = useTranslations(results)
  const shared = useTranslations('shop.results')
  if (result === null) return null
  if (result.ok) {
    return (
      <p role="status" className="flex gap-1.5 text-[0.9375rem]">
        <CircleCheck aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-primary" />
        {success}
      </p>
    )
  }
  const [reason = 'unavailable', row] = result.failure === 'refused' ? result.reason.split(':') : [result.failure]
  const values = { row: row === undefined ? '' : String(Number(row) + 1) }
  const ownKey = reason as Parameters<typeof own>[0]
  const sharedKey = reason as Parameters<typeof shared>[0]
  const message = own.has(ownKey) ? own(ownKey, values) : shared.has(sharedKey) ? shared(sharedKey, values) : shared('unavailable')
  return (
    <p role="alert" className="flex gap-1.5 text-[0.9375rem] text-destructive">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
      {message}
    </p>
  )
}
