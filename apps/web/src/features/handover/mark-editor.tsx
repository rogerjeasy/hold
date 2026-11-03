'use client'

import type { SessionMark } from '@hold/db'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ActionMessage } from '@/features/shop/action-message'
import { useRouter } from '@/i18n/navigation'
import { addHandoverMark, confirmKnownMarks } from './actions'
import { PhotoWithMarks } from '@/components/photo-with-marks'
import { RegionBox } from '@/components/region-box'
import { useDraftBox } from './use-draft-box'

// Read-only once the session is sealed: its marks are then part of the item's history.
type MarkEditorProps = { sessionId: string; view: string; photoUrl: string; marks: readonly SessionMark[]; readOnly?: boolean }

// The item's marks on one view (architecture.md section 9.4): known ones staff confirm are still there, and new ones
// they box on the photograph and describe. A mark recorded here is never charged to this renter.
export function MarkEditor({ sessionId, view, photoUrl, marks, readOnly = false }: MarkEditorProps) {
  const t = useTranslations('shop.handover.marks')
  const locale = useLocale()
  const router = useRouter()
  const draft = useDraftBox()
  const [description, setDescription] = useState('')
  const [added, add, adding] = useActionState(addHandoverMark, null)
  const [confirmed, confirm, confirming] = useActionState(confirmKnownMarks, null)
  useEffect(() => {
    if (added?.ok === true) {
      draft.clear()
      setDescription('')
      router.refresh()
    }
    // Only a new answer clears the form.
  }, [added])
  useEffect(() => {
    if (confirmed?.ok === true) router.refresh()
  }, [confirmed, router])

  return (
    <div className="grid gap-4">
      <PhotoWithMarks src={photoUrl} alt={t('photo')} marks={marks}>
        {draft.box === undefined ? null : (
          <RegionBox
            region={draft.box}
            role="slider"
            tabIndex={0}
            aria-label={t('box')}
            aria-valuetext={t('boxAt', { x: Math.round(draft.box.x * 100), y: Math.round(draft.box.y * 100), width: Math.round(draft.box.width * 100), height: Math.round(draft.box.height * 100) })}
            className="cursor-move touch-none rounded-sm border-mark bg-mark/20 focus-visible:outline-2 focus-visible:outline-offset-2"
            {...draft.handlers}
          />
        )}
      </PhotoWithMarks>
      {marks.length === 0 ? null : (
        <ul className="grid gap-2">
          {marks.map((mark) => (
            <li key={mark.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-background/60 py-2 pr-2 pl-3.5">
              <span className="min-w-0 wrap-long-words">{mark.description}</span>
              {mark.confirmed || readOnly ? (
                <span className="min-h-11 content-center px-2 text-sm font-semibold text-success">{mark.new ? t('added') : t('confirmed')}</span>
              ) : (
                <form action={confirm}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="sessionId" value={sessionId} />
                  <input type="hidden" name="markId" value={mark.id} />
                  <Button type="submit" variant="outline" disabled={confirming} aria-label={t('stillThereItem', { mark: mark.description })}>
                    {t('stillThere')}
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {readOnly ? null : draft.box === undefined ? (
        <Button type="button" variant="outline" className="justify-self-start" onClick={draft.place}>
          {t('add')}
        </Button>
      ) : (
        <form action={add} className="grid gap-3 rounded-xl border border-border/70 bg-muted/40 p-4">
          <p className="text-sm text-pretty text-muted-foreground">{t('howTo')}</p>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="view" value={view} />
          {(['x', 'y', 'width', 'height'] as const).map((field) => (
            <input key={field} type="hidden" name={field} value={String(draft.box?.[field] ?? 0)} />
          ))}
          <div className="grid gap-1.5">
            <Label htmlFor={`mark-${view}`}>{t('description')}</Label>
            <Input id={`mark-${view}`} name="description" maxLength={200} required value={description} onChange={(event) => { setDescription(event.target.value) }} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={adding || !draft.valid}>
              {t('save')}
            </Button>
            <Button type="button" variant="ghost" onClick={draft.clear}>
              {t('cancel')}
            </Button>
          </div>
        </form>
      )}
      <ActionMessage result={added?.ok === true ? null : added} success="" results="shop.handover.results" />
      <ActionMessage result={confirmed?.ok === true ? null : confirmed} success="" results="shop.handover.results" />
    </div>
  )
}
