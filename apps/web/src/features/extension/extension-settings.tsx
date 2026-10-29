'use client'

import { EXTENSION_LIMITS } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ActionMessage } from '@/features/shop/action-message'
import { saveExtensionSettings } from './actions'

// The most extra days a renter may add from their phone, paid in PayPal with nobody to ask (architecture.md section
// 6.14). Hold still refuses days the item is booked, and any end the hold cannot cover.
export function ExtensionSettingsSection({ maxDays, canEdit }: { maxDays: number; canEdit: boolean }) {
  const t = useTranslations('extension.settings')
  const locale = useLocale()
  const [result, save, saving] = useActionState(saveExtensionSettings, null)
  return (
    <section aria-labelledby="extension-settings" className="grid gap-5">
      <div className="grid gap-2">
        <h2 id="extension-settings" className="text-[1.375rem] leading-tight font-extrabold tracking-tight">{t('title')}</h2>
        <p className="max-w-prose text-pretty text-muted-foreground">{t('lead')}</p>
      </div>
      {canEdit ? (
        <form action={save} className="grid gap-3">
          <input type="hidden" name="locale" value={locale} />
          <Label htmlFor="extension-days">{t('maxDays')}</Label>
          <p id="extension-days-hint" className="text-sm text-muted-foreground">{t('hint')}</p>
          <Input id="extension-days" name="maxDays" type="number" min={0} max={EXTENSION_LIMITS.maxDays} step={1} required defaultValue={maxDays} aria-describedby="extension-days-hint" className="sm:max-w-xs" />
          <Button type="submit" disabled={saving} className="min-h-12 justify-self-stretch sm:justify-self-start">{t('save')}</Button>
          <ActionMessage result={result} success={t('saved')} />
        </form>
      ) : <p>{maxDays === 0 ? t('off') : t('readOnly', { days: maxDays })}</p>}
    </section>
  )
}
