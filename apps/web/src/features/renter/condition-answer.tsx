'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { confirmCondition } from './actions'
import type { ConditionItemView } from './condition-item'
import { MissedPhotos } from './missed-photos'
import { RenterMessage } from './renter-message'

// The renter's answer while it is open: everything is as shown, or a photograph of what staff missed.
export function ConditionAnswer({ token, items }: { token: string; items: readonly ConditionItemView[] }) {
  const t = useTranslations('renter.condition')
  const locale = useLocale()
  const [confirmed, confirm, confirming] = useActionState(confirmCondition, null)
  const [adding, setAdding] = useState(false)
  return (
    <div className="grid gap-4 border-t pt-6">
      {adding ? (
        <MissedPhotos token={token} items={items} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <form action={confirm}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="locale" value={locale} />
            <Button type="submit" className="min-h-12" disabled={confirming}>
              {t('confirm')}
            </Button>
          </form>
          <Button type="button" variant="outline" className="min-h-12" onClick={() => { setAdding(true) }}>
            {t('add')}
          </Button>
        </div>
      )}
      <RenterMessage result={confirmed?.ok === true ? null : confirmed} />
    </div>
  )
}
