'use client'

import { CircleAlert, CircleCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ShopActionResult } from '@/server/shop-access'

// What a shop action answered, in plain words. A refusal can name a row of the form, as "amount_invalid:2".
export function ActionMessage({ result, success }: { result: ShopActionResult<unknown> | null; success: string }) {
  const t = useTranslations('shop.results')
  if (result === null) return null
  if (result.ok) {
    return (
      <p role="status" className="flex gap-1.5 text-[0.9375rem]">
        <CircleCheck aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-primary" />
        {success}
      </p>
    )
  }
  const [reason, row] = result.failure === 'refused' ? result.reason.split(':') : [result.failure]
  const key = (reason ?? 'unavailable') as Parameters<typeof t>[0]
  const message = t.has(key) ? t(key, { row: row === undefined ? '' : String(Number(row) + 1) }) : t('unavailable')
  return (
    <p role="alert" className="flex gap-1.5 text-[0.9375rem] text-destructive">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
      {message}
    </p>
  )
}
