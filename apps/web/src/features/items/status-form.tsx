'use client'

import type { ItemStatus } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useId } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ActionMessage } from '@/features/shop/action-message'
import { changeItemStatus } from './actions'

type StatusChangeProps = { itemId: string; to: ItemStatus; action: string; note?: string; help?: string; variant?: 'outline' | 'default' }

// One move of the item's status, with a note when the move needs a reason. The server checks the move again.
export function StatusChange({ itemId, to, action, note, help, variant = 'outline' }: StatusChangeProps) {
  const t = useTranslations('shop.items.passport.status')
  const locale = useLocale()
  const id = useId()
  const [result, change, pending] = useActionState(changeItemStatus, null)
  return (
    <form action={change} className="grid gap-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="status" value={to} />
      {note === undefined ? null : (
        <div className="grid gap-1.5">
          <Label htmlFor={id}>{note}</Label>
          <Textarea id={id} name="note" maxLength={500} rows={2} className="min-h-20" aria-describedby={help === undefined ? undefined : `${id}-help`} />
          {help === undefined ? null : (
            <p id={`${id}-help`} className="text-sm text-muted-foreground">
              {help}
            </p>
          )}
        </div>
      )}
      <Button type="submit" variant={variant} disabled={pending} className="justify-self-start">
        {pending ? t('saving') : action}
      </Button>
      <ActionMessage result={result} success={t('saved')} results="shop.items.results" />
    </form>
  )
}
