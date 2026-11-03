'use client'

import { Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import type { RungDraft } from './ladder-draft'

type RungFieldsProps = {
  rung: RungDraft
  number: number
  // Each field's id, unique on the page.
  idPrefix: string
  currency: string
  onRemove: () => void
}

// One rung of the ladder being written. Every field is sent once per rung, in order, as the action reads them.
export function RungFields({ rung, number, idPrefix, currency, onRemove }: RungFieldsProps) {
  const t = useTranslations('trust.ladder')
  const prefix = <span className="sr-only">{t('rung', { number })}:</span>
  return (
    <li className="grid gap-3 rounded-xl border border-border/70 bg-background/50 p-3.5 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-start">
      <p className="flex items-center gap-2 font-semibold sm:col-span-2 lg:col-span-5">
        <span aria-hidden="true" className="figures grid size-7 place-items-center rounded-lg bg-primary/10 text-sm text-primary">{number}</span>
        {t('rung', { number })}
      </p>
      <div className="grid min-w-0 gap-1.5">
        <Label htmlFor={`${idPrefix}-clean`}>{prefix} {t('cleanReturns')}</Label>
        <Input id={`${idPrefix}-clean`} name="cleanReturns" inputMode="numeric" className="figures" defaultValue={rung.cleanReturns} maxLength={3} required />
      </div>
      <div className="grid min-w-0 gap-1.5">
        <Label htmlFor={`${idPrefix}-share`}>{prefix} {t('share')}</Label>
        <Input id={`${idPrefix}-share`} name="share" inputMode="numeric" className="figures" defaultValue={rung.share} maxLength={2} required />
      </div>
      <div className="grid min-w-0 gap-1.5">
        <Label htmlFor={`${idPrefix}-value`}>{prefix} {t('largestValue', { currency })}</Label>
        <Input id={`${idPrefix}-value`} name="largestValue" inputMode="decimal" className="figures" defaultValue={rung.largestValue} maxLength={20} aria-describedby={`${idPrefix}-value-help`} />
        <p id={`${idPrefix}-value-help`} className="text-sm text-muted-foreground">{t('largestValueHelp')}</p>
      </div>
      <div className="grid min-w-0 gap-1.5">
        <Label htmlFor={`${idPrefix}-saved`}>{prefix} {t('savedMethod')}</Label>
        <Select id={`${idPrefix}-saved`} name="savedMethod" defaultValue={rung.savedMethod}>
          <option value="no">{t('savedMethodNo')}</option>
          <option value="yes">{t('savedMethodYes')}</option>
        </Select>
      </div>
      <Button type="button" variant="ghost" size="icon" className="self-end hover:bg-destructive/10 hover:text-destructive lg:self-start lg:mt-6.5" onClick={onRemove} aria-label={t('remove', { number })}>
        <Trash2 aria-hidden="true" />
      </Button>
    </li>
  )
}
