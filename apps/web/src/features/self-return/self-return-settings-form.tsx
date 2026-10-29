'use client'

import type { SelfReturnSettings } from '@hold/domain'
import { SELF_RETURN_LIMITS } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CheckBox } from '@/components/ui/check-box'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ActionMessage } from '@/features/shop/action-message'
import { saveSelfReturnSettings } from './actions'
import { DropPointCard } from './return-intro'

// The owner's settings for returns with nobody at the counter, beside the card renters will read, as it will read.
export function SelfReturnSettingsForm({ shopName, settings }: { shopName: string; settings: SelfReturnSettings }) {
  const t = useTranslations('selfReturn.settings')
  const locale = useLocale()
  const [result, save, saving] = useActionState(saveSelfReturnSettings, null)
  const [allowed, setAllowed] = useState(settings.allowed)
  const [dropPoint, setDropPoint] = useState(settings.dropPoint ?? '')
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="grid min-w-0 gap-5">
        {/* Outside the form, which React resets after each save: the box itself carries no value, the hidden field does. */}
        <CheckBox label={t('allowed')} checked={allowed} onChange={setAllowed} />
        <form action={save} className="grid min-w-0 gap-5">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="allowed" value={allowed ? 'on' : 'off'} />
          <div className="grid gap-2">
            <Label htmlFor="drop-point">{t('dropPoint')}</Label>
            <p id="drop-point-hint" className="text-sm text-muted-foreground">{t('dropPointHint')}</p>
            <Textarea id="drop-point" name="dropPoint" aria-describedby="drop-point-hint" maxLength={SELF_RETURN_LIMITS.dropPointLength} value={dropPoint} onChange={(event) => { setDropPoint(event.target.value) }} className="min-h-24" />
          </div>
          <fieldset className="grid gap-2">
            <legend className="text-[0.9375rem] font-semibold">{t('hours')}</legend>
            <p id="hours-hint" className="text-sm text-muted-foreground">{t('hoursHint')}</p>
            <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
              <div className="grid gap-1.5">
                <Label htmlFor="opens">{t('opens')}</Label>
                <Input id="opens" name="opens" type="time" aria-describedby="hours-hint" defaultValue={settings.hours?.opens ?? ''} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="closes">{t('closes')}</Label>
                <Input id="closes" name="closes" type="time" aria-describedby="hours-hint" defaultValue={settings.hours?.closes ?? ''} />
              </div>
            </div>
          </fieldset>
          <Button type="submit" disabled={saving} className="min-h-12 justify-self-stretch sm:justify-self-start">{t('save')}</Button>
          <ActionMessage result={result} success={t('saved')} results="selfReturn.settings.results" />
        </form>
      </div>
      <aside aria-labelledby="preview" className="grid min-w-0 gap-3">
        <h2 id="preview" className="label text-xs text-muted-foreground">{t('preview')}</h2>
        {allowed && dropPoint.trim() !== '' ? <DropPointCard shopName={shopName} dropPoint={dropPoint.trim()} /> : <p className="border border-dashed p-4 text-muted-foreground">{allowed ? t('previewEmpty') : t('off')}</p>}
      </aside>
    </div>
  )
}
