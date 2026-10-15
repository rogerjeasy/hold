import { ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PasskeyGate } from '@/features/shop/passkey-gate'
import { ShopFrame } from '@/features/shop/shop-frame'
import { Link } from '@/i18n/navigation'
import { shopRoutes } from '@/lib/routes'
import { ItemTypeForm } from './item-type-form'
import type { ItemTypeFormValues } from './item-type-form'

type ItemTypeScreenProps = {
  shopName: string
  currency: string
  values: ItemTypeFormValues | undefined
  canManage: boolean
  returnTo: string
  gate: { needed: boolean; hasPasskey: boolean; email: string }
}

// The page around the item type form: a new type, or one being edited.
export function ItemTypeScreen({ shopName, currency, values, canManage, returnTo, gate }: ItemTypeScreenProps) {
  const t = useTranslations('shop.items.form')
  return (
    <ShopFrame shopName={shopName} title={values === undefined ? t('newTitle') : t('editTitle', { name: values.name })}>
      <div className="grid max-w-4xl gap-8">
        <Link href={shopRoutes.items} className="inline-flex min-h-11 items-center gap-1.5 justify-self-start font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t('back')}
        </Link>
        {canManage ? (
          <PasskeyGate {...gate} returnTo={returnTo} confirmBody={t('passkeyBody')}>
            <ItemTypeForm currency={currency} values={values} />
          </PasskeyGate>
        ) : (
          <p className="text-muted-foreground">{t('readOnly')}</p>
        )}
      </div>
    </ShopFrame>
  )
}
