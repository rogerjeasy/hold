'use client'
import type { PassportMark } from '@hold/db'
import type { PhotoPlanView } from '@hold/db'
import { Check } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { ActionMessage } from '@/features/shop/action-message'
import { openRepair } from './actions'

// Open marks no repair covers yet, to repair: wear, or damage nobody was charged for.
export function ChooseMarksForm({ itemId, marks, views }: { itemId: string; marks: readonly PassportMark[]; views: readonly PhotoPlanView[] }) {
  const t = useTranslations('repairs')
  const locale = useLocale()
  const [result, open, opening] = useActionState(openRepair, null)
  return (
    <Panel title={t('chooseTitle')}>
      <form action={open} className="grid gap-3 px-4 py-4 md:px-5">
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="locale" value={locale} />
        <p className="text-sm text-muted-foreground text-pretty">{t('chooseLead')}</p>
        <fieldset className="grid gap-1">
          <legend className="sr-only">{t('chooseTitle')}</legend>
          {marks.map((mark) => (
            <label key={mark.id} className="flex min-h-11 cursor-pointer items-center gap-2 py-1">
              {/* A box drawn at the size of text, its real control an invisible input filling a 44 pixel square on top. */}
              <span className="relative grid size-11 shrink-0 place-items-center">
                <input type="checkbox" name="markId" value={mark.id} className="peer absolute inset-0 size-11 cursor-pointer opacity-0" />
                <span aria-hidden="true" className="grid size-5 place-items-center rounded-md border-2 border-border-strong bg-card text-primary-foreground peer-checked:border-primary peer-checked:bg-primary peer-checked:[&>svg]:opacity-100 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background">
                  <Check className="size-3.5 opacity-0" strokeWidth={3} />
                </span>
              </span>
              <span className="min-w-0"><span className="block font-semibold wrap-long-words">{mark.description}</span><span className="block text-sm text-muted-foreground">{views.find((view) => view.key === mark.view)?.label ?? mark.view}</span></span>
            </label>
          ))}
        </fieldset>
        <Button type="submit" variant="outline" disabled={opening} className="justify-self-stretch sm:justify-self-start">{t('open')}</Button>
        <ActionMessage result={result} success={t('opened')} results="repairs.results" />
      </form>
    </Panel>
  )
}
