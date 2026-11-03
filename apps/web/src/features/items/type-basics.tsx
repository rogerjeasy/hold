'use client'

import { ITEM_CATEGORIES, ITEM_TYPE_LIMITS } from '@hold/domain'
import type { ItemCategory } from '@hold/domain'
import { Coins } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { FormCard } from '@/components/ui/form-card'

export type Amounts = { readonly value: string; readonly hold: string; readonly dayRate: string }

type TypeBasicsProps = { name: string; category: ItemCategory; onCategory: (category: ItemCategory) => void; amounts: Amounts; currency: string }

// The type's name and kind, and the three amounts every rental of it is priced from.
export function TypeBasics({ name, category, onCategory, amounts, currency }: TypeBasicsProps) {
  const t = useTranslations('shop.items.form')
  const categories = useTranslations('shop.items.categories')
  const amount = (field: keyof Amounts, label: string) => (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={field}>{label}</Label>
      <Input id={field} name={field} inputMode="decimal" className="figures" defaultValue={amounts[field]} maxLength={20} required />
    </div>
  )

  return (
    <>
      <div className="surface grid gap-5 p-4 sm:grid-cols-2 md:p-5">
        <div className="grid content-start gap-1.5">
          <Label htmlFor="name">{t('name')}</Label>
          <Input id="name" name="name" defaultValue={name} maxLength={ITEM_TYPE_LIMITS.name} required aria-describedby="name-help" />
          <p id="name-help" className="text-sm text-muted-foreground">
            {t('nameHelp')}
          </p>
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="category">{t('category')}</Label>
          <Select id="category" name="category" value={category} onChange={(event) => { onCategory(event.target.value as ItemCategory) }}>
            {ITEM_CATEGORIES.map((each) => (
              <option key={each} value={each}>
                {categories(each)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <FormCard title={t('amounts')} help={t('amountsHelp')} icon={Coins}>
        <div className="grid gap-5 sm:grid-cols-3">
          {amount('value', t('value', { currency }))}
          {amount('hold', t('hold', { currency }))}
          {amount('dayRate', t('dayRate', { currency }))}
        </div>
      </FormCard>
    </>
  )
}
