'use client'

import { PHOTO_PLAN_LIMITS, VIEW_OUTLINES } from '@hold/domain'
import type { PhotoPlanViewDraft } from '@hold/domain'
import { ArrowDown, ArrowUp, Check, Focus, Info, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { OutlineOverlay } from '@/features/handover/outline-overlay'
import { FormCard } from '@/components/ui/form-card'
import type { Rows } from './use-rows'

type PhotoPlanEditorProps = {
  views: Rows<PhotoPlanViewDraft>
  // Called on any change the person makes, so the form stops following the kind.
  onEdit: () => void
  onSuggest: () => void
  editing: boolean
}

// The views staff photograph, in order, each beside the frame staff will line the camera up in. Each row sends its
// label, framing and whether it is required, so the three lists line up on the server.
export function PhotoPlanEditor({ views, onEdit, onSuggest, editing }: PhotoPlanEditorProps) {
  const t = useTranslations('shop.items.form')
  const outlines = useTranslations('shop.items.outlines')
  const edit = (change: () => void) => () => {
    change()
    onEdit()
  }

  return (
    <FormCard title={t('plan')} help={t('planHelp')} icon={Focus}>
      {editing ? <p className="flex max-w-prose gap-2.5 rounded-xl bg-warning/10 px-3.5 py-3 text-sm"><Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />{t('planChangeNote')}</p> : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button type="button" variant="outline" onClick={onSuggest}>
          <Sparkles aria-hidden="true" />
          {t('suggest')}
        </Button>
        <span className="text-sm text-muted-foreground">{t('suggestHelp')}</span>
      </div>
      <ol className="grid gap-3">
        {views.rows.map((view, index) => {
          const number = index + 1
          const id = `view-${String(view.key)}`
          return (
            <li key={view.key} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-3 rounded-xl border border-border/70 bg-background/50 p-3 sm:grid-cols-[5.5rem_minmax(0,1fr)_11rem] xl:grid-cols-[5.5rem_minmax(0,1fr)_11rem_auto] xl:items-end">
              <div aria-hidden="true" className="relative row-span-2 aspect-thumbnail self-start overflow-hidden rounded-lg bg-photo text-photo-foreground sm:row-span-1 xl:self-end">
                <OutlineOverlay outline={view.outline} />
                <span className="figures absolute top-1 left-1 grid size-5 place-items-center rounded bg-photo-scrim text-[0.6875rem]">{number}</span>
              </div>
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor={id}>{t('viewLabel', { number })}</Label>
                <Input id={id} name="viewLabel" value={view.label} maxLength={PHOTO_PLAN_LIMITS.label} required onChange={(event) => { edit(() => { views.update(view.key, { label: event.target.value }) })() }} />
              </div>
              <div className="grid min-w-0 sm:self-end">
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
              <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 sm:col-span-3 xl:col-span-1">
                <input type="hidden" name="viewRequired" value={view.required ? 'yes' : 'no'} />
                <button
                  type="button"
                  role="switch"
                  aria-checked={view.required}
                  aria-label={t('requiredOf', { number })}
                  className="group inline-flex min-h-11 items-center gap-2 rounded-xl border border-border-strong bg-card px-3 text-[0.9375rem] font-semibold transition-colors hover:bg-accent aria-checked:border-primary/40 aria-checked:bg-primary/8"
                  onClick={edit(() => { views.update(view.key, { required: !view.required }) })}
                >
                  <span aria-hidden="true" className="grid size-4.5 place-items-center rounded-sm border border-border-strong bg-card transition-colors group-aria-checked:border-primary group-aria-checked:bg-primary group-aria-checked:text-primary-foreground">
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
                  <Button type="button" variant="ghost" size="icon" className="hover:bg-destructive/10 hover:text-destructive" disabled={views.rows.length === 1} aria-label={t('viewRemove', { number })} onClick={edit(() => { views.remove(view.key) })}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
      <Button type="button" variant="soft" className="justify-self-start" disabled={views.rows.length >= PHOTO_PLAN_LIMITS.views} onClick={edit(() => { views.add({ label: '', outline: 'detail', required: false }) })}>
        <Plus aria-hidden="true" />
        {t('viewAdd')}
      </Button>
    </FormCard>
  )
}
