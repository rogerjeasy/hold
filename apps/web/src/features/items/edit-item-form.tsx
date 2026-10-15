'use client'

import { ITEM_LIMITS } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ActionMessage } from '@/features/shop/action-message'
import { editItem } from './actions'

type EditItemFormProps = { itemId: string; label: string; size: string | null; serial: string | null }

export function EditItemForm({ itemId, label, size, serial }: EditItemFormProps) {
  const t = useTranslations('shop.items.passport.edit')
  const locale = useLocale()
  const [result, save, pending] = useActionState(editItem, null)
  return (
    <form action={save} className="grid gap-4 px-4 py-4 md:px-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="itemId" value={itemId} />
      <div className="grid gap-1.5">
        <Label htmlFor="item-label">{t('label')}</Label>
        <Input id="item-label" name="label" defaultValue={label} maxLength={ITEM_LIMITS.label} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="item-size">{t('size')}</Label>
          <Input id="item-size" name="size" defaultValue={size ?? ''} maxLength={ITEM_LIMITS.size} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="item-serial">{t('serial')}</Label>
          <Input id="item-serial" name="serial" defaultValue={serial ?? ''} maxLength={ITEM_LIMITS.serial} />
        </div>
      </div>
      <Button type="submit" variant="outline" disabled={pending} className="justify-self-start">
        {pending ? t('saving') : t('save')}
      </Button>
      <ActionMessage result={result} success={t('saved')} results="shop.items.results" />
    </form>
  )
}
