'use client'

import { suggestedPhotoPlan } from '@hold/domain'
import type { ItemCategory, PhotoPlanViewDraft } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ActionMessage } from '@/features/shop/action-message'
import { useRouter } from '@/i18n/navigation'
import { shopRoutes } from '@/lib/routes'
import { saveItemType } from './actions'
import { KitEditor } from './kit-editor'
import type { KitRow } from './kit-editor'
import { PhotoPlanEditor } from './photo-plan-editor'
import { TypeBasics } from './type-basics'
import type { Amounts } from './type-basics'
import { useRows } from './use-rows'

export type ItemTypeFormValues = Amounts & {
  readonly itemTypeId: string
  readonly name: string
  readonly category: ItemCategory
  readonly accessories: readonly KitRow[]
  readonly views: readonly PhotoPlanViewDraft[]
}

// Creates an item type, or edits one when given its values. A new type follows its kind with the suggested views
// until the person changes a view themselves.
export function ItemTypeForm({ currency, values }: { currency: string; values?: ItemTypeFormValues }) {
  const t = useTranslations('shop.items.form')
  const suggestedLabel = useTranslations('shop.items.suggestedViews')
  const locale = useLocale()
  const router = useRouter()
  const [result, save, pending] = useActionState(saveItemType, null)
  const suggestion = (kind: ItemCategory): PhotoPlanViewDraft[] =>
    suggestedPhotoPlan(kind).map((view) => ({ label: suggestedLabel(view.key as Parameters<typeof suggestedLabel>[0]), outline: view.outline, required: view.required }))
  const [category, setCategory] = useState<ItemCategory>(values?.category ?? 'bike')
  const [touched, setTouched] = useState(values !== undefined)
  const views = useRows(values?.views ?? suggestion(category))
  const kit = useRows<KitRow>(values?.accessories ?? [])

  useEffect(() => {
    if (result?.ok === true) router.push(shopRoutes.items)
  }, [result, router])

  const chooseCategory = (next: ItemCategory) => {
    setCategory(next)
    if (!touched) views.replace(suggestion(next))
  }

  return (
    <form action={save} className="grid gap-10">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="itemTypeId" value={values?.itemTypeId ?? ''} />
      <TypeBasics name={values?.name ?? ''} category={category} onCategory={chooseCategory} amounts={values ?? { value: '', hold: '', dayRate: '' }} currency={currency} />
      <KitEditor kit={kit} />
      <PhotoPlanEditor
        views={views}
        editing={values !== undefined}
        onEdit={() => {
          setTouched(true)
        }}
        onSuggest={() => {
          views.replace(suggestion(category))
        }}
      />
      <div className="grid gap-3">
        <Button type="submit" disabled={pending} className="min-h-12 justify-self-start">
          {pending ? t('saving') : t('save')}
        </Button>
        <ActionMessage result={result} success={t('saved')} results="shop.items.results" />
      </div>
    </form>
  )
}
