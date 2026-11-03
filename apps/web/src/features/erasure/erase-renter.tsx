'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CheckBox } from '@/components/ui/check-box'
import { ActionMessage } from '@/features/shop/action-message'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'
import { eraseRenter } from './actions'

type EraseRenterProps = { rentalId: string; erasedAt: Date | null; clock: ShopClock }

// The owner erases a renter's personal details on their request, once the rental has ended (architecture.md section
// 15.2). It cannot be undone, so it asks once more on the page, with a box to tick, and never in a browser dialog.
export function EraseRenter({ rentalId, erasedAt, clock }: EraseRenterProps) {
  const t = useTranslations('shop.erasure')
  const locale = useLocale()
  const format = useShopFormat(clock)
  const titleId = useId()
  const [result, erase, pending] = useActionState(eraseRenter, null)
  const [asking, setAsking] = useState(false)
  const [understood, setUnderstood] = useState(false)
  const stopAsking = () => {
    setAsking(false)
    setUnderstood(false)
  }
  return (
    <section aria-labelledby={titleId} className="grid min-w-0 gap-3 rounded-2xl border border-destructive/30 bg-[color-mix(in_oklab,var(--destructive)_4%,var(--card))] p-4 text-card-foreground shadow-xs md:p-5">
      <h2 id={titleId} className="font-semibold">{t('title')}</h2>
      {erasedAt !== null ? (
        <p>{t('erasedOn', { date: format.day(erasedAt) })}</p>
      ) : result?.ok === true ? (
        <p role="status">{t('done')}</p>
      ) : (
        <>
          <p className="max-w-prose text-muted-foreground">{t('body')}</p>
          {asking ? (
            <form action={erase} className="grid justify-items-start gap-3">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="rentalId" value={rentalId} />
              <CheckBox label={t('understood')} checked={understood} onChange={setUnderstood} />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="outline" className="border-destructive text-destructive" disabled={!understood || pending}>
                  {pending ? t('erasing') : t('confirm')}
                </Button>
                <Button type="button" variant="ghost" onClick={stopAsking}>
                  {t('cancel')}
                </Button>
              </div>
            </form>
          ) : (
            <Button type="button" variant="outline" className="justify-self-start" onClick={() => { setAsking(true) }}>
              {t('action')}
            </Button>
          )}
          <ActionMessage result={result} success={t('done')} results="shop.erasure.results" />
        </>
      )}
    </section>
  )
}
