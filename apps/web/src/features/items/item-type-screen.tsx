import { ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PasskeyGate } from '@/features/shop/passkey-gate'
import type { PasskeyGateState } from '@/features/shop/passkey-gate'
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
  gate: PasskeyGateState
}

// The page around the item type form: a new type, or one being edited.
export function ItemTypeScreen({ shopName, currency, values, canManage, returnTo, gate }: ItemTypeScreenProps) {
  const t = useTranslations('shop.items.form')
  return (
    <ShopFrame shopName={shopName} title={values === undefined ? t('newTitle') : t('editTitle', { name: values.name })}>
      <div className="grid max-w-4xl min-w-0 gap-6">
        <Link href={shopRoutes.items} className="-mt-4 -ml-2 inline-flex min-h-11 items-center gap-1.5 justify-self-start rounded-xl px-2 font-semibold text-muted-foreground transition-colors hover:bg-foreground/6 hover:text-foreground md:-mt-6">
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t('back')}
        </Link>
        {canManage ? (
          <PasskeyGate {...gate} returnTo={returnTo} body={t('passkeyBody')}>
            <ItemTypeForm currency={currency} values={values} />
          </PasskeyGate>
        ) : (
          <p className="text-muted-foreground">{t('readOnly')}</p>
        )}
      </div>
    </ShopFrame>
  )
}
