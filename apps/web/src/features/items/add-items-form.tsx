'use client'

import { ITEM_LIMITS } from '@hold/domain'
import { Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ActionMessage } from '@/features/shop/action-message'
import { addItems } from './actions'

// Adds numbered items of one type. Folded away until asked for, so the list stays the page's subject.
export function AddItemsForm({ itemTypeId, typeName }: { itemTypeId: string; typeName: string }) {
  const t = useTranslations('shop.items.add')
  const locale = useLocale()
  const [result, add, pending] = useActionState(addItems, null)
  const [count, setCount] = useState('1')
  const id = useId()
  const one = count.trim() === '1'

  return (
    <details className="group border-t border-border/70">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 font-semibold text-primary transition-colors hover:bg-primary/5 md:px-5 [&::-webkit-details-marker]:hidden">
        <Plus aria-hidden="true" className="size-4 transition-transform duration-300 ease-spring group-open:rotate-45" />
        {t('open')}
      </summary>
      <form action={add} className="grid gap-4 px-4 pb-5 md:px-5">
        <p className="text-sm text-muted-foreground">{t('title', { name: typeName })}</p>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="itemTypeId" value={itemTypeId} />
        <div className="grid gap-4 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-1.5">
            <Label htmlFor={`${id}-count`}>{t('count')}</Label>
            <Input id={`${id}-count`} name="count" type="number" min={1} max={ITEM_LIMITS.addAtOnce} value={count} onChange={(event) => { setCount(event.target.value) }} required />
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor={`${id}-size`}>{t('size')}</Label>
            <Input id={`${id}-size`} name="size" maxLength={ITEM_LIMITS.size} aria-describedby={`${id}-size-help`} />
            <p id={`${id}-size-help`} className="text-sm text-muted-foreground">{t('sizeHelp')}</p>
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor={`${id}-serial`}>{t('serial')}</Label>
            <Input id={`${id}-serial`} name="serial" maxLength={ITEM_LIMITS.serial} disabled={!one} aria-describedby={`${id}-serial-help`} />
            <p id={`${id}-serial-help`} className="text-sm text-muted-foreground">{t('serialHelp')}</p>
          </div>
        </div>
        <Button type="submit" variant="outline" disabled={pending} className="justify-self-start">
          {pending ? t('adding') : t('submit')}
        </Button>
        <ActionMessage result={result} success={t('added')} results="shop.items.results" />
      </form>
    </details>
  )
}
