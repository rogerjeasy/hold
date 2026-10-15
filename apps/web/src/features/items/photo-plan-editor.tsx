'use client'

import { PHOTO_PLAN_LIMITS, VIEW_OUTLINES } from '@hold/domain'
import type { PhotoPlanViewDraft } from '@hold/domain'
import { ArrowDown, ArrowUp, Check, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import type { Rows } from './use-rows'

type PhotoPlanEditorProps = {
  views: Rows<PhotoPlanViewDraft>
  // Called on any change the person makes, so the form stops following the kind.
  onEdit: () => void
  onSuggest: () => void
  editing: boolean
}

// The views staff photograph, in order. Each row sends its label, framing and whether it is required, so the three
// lists line up on the server.
export function PhotoPlanEditor({ views, onEdit, onSuggest, editing }: PhotoPlanEditorProps) {
  const t = useTranslations('shop.items.form')
  const outlines = useTranslations('shop.items.outlines')
  const edit = (change: () => void) => () => {
    change()
    onEdit()
  }

  return (
    <fieldset className="grid gap-4">
      <legend className="text-title">{t('plan')}</legend>
      <p className="max-w-prose text-muted-foreground">{t('planHelp')}</p>
      {editing ? <p className="max-w-prose border-l-2 border-primary pl-3 text-sm">{t('planChangeNote')}</p> : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button type="button" variant="outline" onClick={onSuggest}>
          {t('suggest')}
        </Button>
        <span className="text-sm text-muted-foreground">{t('suggestHelp')}</span>
      </div>
      <ol className="grid gap-3">
        {views.rows.map((view, index) => {
          const number = index + 1
          const id = `view-${String(view.key)}`
          return (
            <li key={view.key} className="grid gap-3 border-b pb-3 sm:grid-cols-[minmax(0,1fr)_11rem] lg:grid-cols-[minmax(0,1fr)_11rem_auto] lg:items-end">
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor={id}>{t('viewLabel', { number })}</Label>
                <Input id={id} name="viewLabel" value={view.label} maxLength={PHOTO_PLAN_LIMITS.label} required onChange={(event) => { edit(() => { views.update(view.key, { label: event.target.value }) })() }} />
              </div>
              <div className="grid">
                <Label htmlFor={`${id}-outline`} className="sr-only">
                  {t('outline', { number })}
                </Label>
                <Select id={`${id}-outline`} name="viewOutline" value={view.outline} onChange={(event) => { edit(() => { views.update(view.key, { outline: event.target.value as PhotoPlanViewDraft['outline'] }) })() }}>
                  {VIEW_OUTLINES.map((outline) => (
                    <option key={outline} value={outline}>
                      {outlines(outline)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex items-center justify-between gap-2 sm:col-span-2 lg:col-span-1">
                <input type="hidden" name="viewRequired" value={view.required ? 'yes' : 'no'} />
                <button
                  type="button"
                  role="switch"
                  aria-checked={view.required}
                  aria-label={t('requiredOf', { number })}
                  className="group inline-flex min-h-11 items-center gap-2 rounded-lg border border-border-strong px-3 text-[0.9375rem] font-semibold hover:bg-accent aria-checked:border-foreground"
                  onClick={edit(() => { views.update(view.key, { required: !view.required }) })}
                >
                  <span aria-hidden="true" className="grid size-4.5 place-items-center border border-border-strong bg-card group-aria-checked:border-primary group-aria-checked:bg-primary group-aria-checked:text-primary-foreground">
                    {view.required ? <Check className="size-3.5" /> : null}
                  </span>
                  <span aria-hidden="true">{t('required')}</span>
                </button>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon" disabled={index === 0} aria-label={t('moveUp', { number })} onClick={edit(() => { views.move(view.key, -1) })}>
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" disabled={index === views.rows.length - 1} aria-label={t('moveDown', { number })} onClick={edit(() => { views.move(view.key, 1) })}>
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" disabled={views.rows.length === 1} aria-label={t('viewRemove', { number })} onClick={edit(() => { views.remove(view.key) })}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
      <Button type="button" variant="outline" className="justify-self-start" disabled={views.rows.length >= PHOTO_PLAN_LIMITS.views} onClick={edit(() => { views.add({ label: '', outline: 'detail', required: false }) })}>
        <Plus aria-hidden="true" />
        {t('viewAdd')}
      </Button>
    </fieldset>
  )
}
