'use client'

import { shopTimeText } from '@hold/domain'
import { CircleAlert } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useShopFormat } from '@/hooks/use-shop-format'
import { useRouter } from '@/i18n/navigation'
import { askExtension } from './renter-actions'

const DAY = 86_400_000
const QUICK_DAYS = [1, 2, 3] as const

// Why more days cannot be had, with what the renter needs to act on it: the latest end the hold covers, when the item
// is needed next, or the most days the shop allows.
function Refused({ reason, timeZone }: { reason: string; timeZone: string }) {
  const t = useTranslations('extension.refused')
  const results = useTranslations('renter.results')
  const format = useShopFormat({ timeZone, currency: null })
  const [kind = '', value = ''] = reason.split(/:(.*)/s)
  const when = () => `${format.date(new Date(value))}, ${format.time(new Date(value))}`
  const text = kind === 'beyond_hold' ? t('beyond_hold', { when: when() })
    : kind === 'not_free' ? t('not_free', { when: when() })
      : kind === 'too_many_days' ? t('too_many_days', { days: Number(value) })
        : t.has(kind as Parameters<typeof t>[0]) ? t(kind as Parameters<typeof t>[0])
          : results.has(kind as Parameters<typeof results>[0]) ? results(kind as Parameters<typeof results>[0]) : results('paypal_unavailable')
  return (
    <p role="alert" className="flex gap-1.5 text-[0.9375rem] text-destructive">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
      {text}
    </p>
  )
}

// The new end, chosen in a tap for the usual one to three days or set to the minute, on the shop's clock. Hold prices
// it; nothing is asked of the renter until they see the price.
export function ExtendForm({ token, endsAt, timeZone, suggestedEnd, maxDays }: { token: string; endsAt: Date; timeZone: string; suggestedEnd: string; maxDays: number }) {
  const t = useTranslations('extension.form')
  const locale = useLocale()
  const router = useRouter()
  const [end, setEnd] = useState(suggestedEnd)
  const [result, ask, pending] = useActionState(askExtension, null)
  useEffect(() => {
    if (result?.ok === true) router.refresh()
  }, [result, router])
  const quick = QUICK_DAYS.filter((days) => days <= maxDays).map((days) => ({ days, at: shopTimeText(timeZone, new Date(endsAt.getTime() + days * DAY)) }))
  return (
    <form action={ask} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      <fieldset className="grid gap-2">
        <legend className="mb-1 font-semibold">{t('quick')}</legend>
        <div className="flex flex-wrap gap-2">
          {quick.map((choice) => (
            <Button key={choice.days} type="button" variant={end === choice.at ? 'default' : 'outline'} aria-pressed={end === choice.at} className="min-h-12" onClick={() => { setEnd(choice.at) }}>
              {t('days', { count: choice.days })}
            </Button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-1.5 sm:max-w-xs">
        <Label htmlFor="extension-end">{t('newEnd')}</Label>
        <Input id="extension-end" name="endsAt" type="datetime-local" required min={shopTimeText(timeZone, endsAt)} value={end} onChange={(event) => { setEnd(event.target.value) }} />
      </div>
      <Button type="submit" className="min-h-12 justify-self-stretch sm:justify-self-start" disabled={pending}>{t('price')}</Button>
      {result?.ok === false ? <Refused reason={result.failure === 'refused' ? result.reason : result.failure} timeZone={timeZone} /> : null}
    </form>
  )
}
