'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ActionMessage } from '@/features/shop/action-message'
import { letGoOfBooking } from './actions'

// Letting go of an unpaid booking frees its items. It asks once more on the page, not in a browser dialog.
export function LetGo({ rentalId }: { rentalId: string }) {
  const t = useTranslations('shop.rentals.letGo')
  const locale = useLocale()
  const [result, letGo, pending] = useActionState(letGoOfBooking, null)
  const [asking, setAsking] = useState(false)
  return (
    <section className="grid gap-3 border border-border-strong p-4 md:p-5">
      <h2 className="font-semibold">{t('title')}</h2>
      <p className="text-muted-foreground">{t('body')}</p>
      {asking ? (
        <form action={letGo} className="flex flex-wrap gap-2">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="rentalId" value={rentalId} />
          <Button type="submit" disabled={pending}>
            {t('confirm')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => { setAsking(false) }}>
            {t('cancel')}
          </Button>
        </form>
      ) : (
        <Button type="button" variant="outline" className="justify-self-start" onClick={() => { setAsking(true) }}>
          {t('action')}
        </Button>
      )}
      <ActionMessage result={result} success={t('done')} results="shop.rentals.results" />
    </section>
  )
}
