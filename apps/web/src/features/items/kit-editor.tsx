'use client'

import { ITEM_TYPE_LIMITS } from '@hold/domain'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Rows } from './use-rows'

export type KitRow = { readonly name: string; readonly count: string }

// What goes out with each item, counted back at the return.
export function KitEditor({ kit }: { kit: Rows<KitRow> }) {
  const t = useTranslations('shop.items.form')
  return (
    <fieldset className="grid gap-4">
      <legend className="text-title">{t('kit')}</legend>
      <p className="max-w-prose text-muted-foreground">{t('kitHelp')}</p>
      {kit.rows.length === 0 ? null : (
        <ol className="grid gap-3">
          {kit.rows.map((row, index) => {
            const number = index + 1
            const id = `kit-${String(row.key)}`
            return (
              <li key={row.key} className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-end gap-3">
                <div className="grid min-w-0 gap-1.5">
                  <Label htmlFor={id}>{t('kitName', { number })}</Label>
                  <Input id={id} name="accessoryName" value={row.name} maxLength={ITEM_TYPE_LIMITS.accessoryName} required onChange={(event) => { kit.update(row.key, { name: event.target.value }) }} />
                </div>
                <Input
                  name="accessoryCount"
                  type="number"
                  min={1}
                  max={ITEM_TYPE_LIMITS.accessoryCount}
                  value={row.count}
                  required
                  aria-label={t('kitCount', { number })}
                  onChange={(event) => { kit.update(row.key, { count: event.target.value }) }}
                />
                <Button type="button" variant="ghost" size="icon" aria-label={t('kitRemove', { number })} onClick={() => { kit.remove(row.key) }}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            )
          })}
        </ol>
      )}
      <Button type="button" variant="outline" className="justify-self-start" disabled={kit.rows.length >= ITEM_TYPE_LIMITS.accessories} onClick={() => { kit.add({ name: '', count: '1' }) }}>
        <Plus aria-hidden="true" />
        {t('kitAdd')}
      </Button>
    </fieldset>
  )
}
