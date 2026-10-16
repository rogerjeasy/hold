'use client'

import { MISSED_VIEWS } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { PhotoTaker } from '@/features/handover/photo-taker'
import { useRouter } from '@/i18n/navigation'
import { sendMissed } from './actions'
import type { ConditionItemView } from './condition-item'
import { RenterMessage } from './renter-message'
import { useRenterUpload } from './use-renter-upload'

// Photographs of what staff missed, added to one item at a time, then sent with the renter's answer.
export function MissedPhotos({ token, items }: { token: string; items: readonly ConditionItemView[] }) {
  const t = useTranslations('renter.condition')
  const locale = useLocale()
  const router = useRouter()
  const [itemId, setItemId] = useState(items[0]?.itemId ?? '')
  const [taken, setTaken] = useState(0)
  const [sent, send, sending] = useActionState(sendMissed, null)
  const item = items.find((each) => each.itemId === itemId)
  // The next free view, up to the last; a renter who adds more replaces the last one.
  const view: string = MISSED_VIEWS[Math.min((item?.added.length ?? 0) + taken, MISSED_VIEWS.length - 1)] ?? 'missed-1'
  const upload = useRenterUpload(token, itemId, view)
  return (
    <div className="grid gap-4">
      {items.length > 1 ? (
        <label className="grid gap-1.5">
          <span className="font-semibold">{t('which')}</span>
          <select value={itemId} onChange={(event) => { setItemId(event.target.value); setTaken(0) }} className="min-h-11 border bg-background px-3">
            {items.map((each) => (
              <option key={each.itemId} value={each.itemId}>
                {each.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <PhotoTaker key={`${itemId}-${view}`} view={{ key: view, label: t('missedView'), outline: 'detail' }} upload={upload} onTaken={() => { setTaken((count) => count + 1); router.refresh() }} />
      <form action={send} className="grid gap-2">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" className="min-h-12 justify-self-start" disabled={sending || (taken === 0 && items.every((each) => each.added.length === 0))}>
          {t('send')}
        </Button>
        <RenterMessage result={sent?.ok === true ? null : sent} />
      </form>
    </div>
  )
}
