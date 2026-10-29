import type { SelfReturnSettings } from '@hold/domain'
import { useTranslations } from 'next-intl'
import { ShopFrame } from '@/features/shop/shop-frame'
import { DropPointCard } from './return-intro'
import { SelfReturnSettingsForm } from './self-return-settings-form'

// Whether renters may return items with nobody at the counter (architecture.md section 6.13). The owner decides; other
// staff read what renters are told.
export function SelfReturnSettingsScreen({ shopName, settings, canEdit }: { shopName: string; settings: SelfReturnSettings; canEdit: boolean }) {
  const t = useTranslations('selfReturn.settings')
  return (
    <ShopFrame shopName={shopName} title={t('title')}>
      <div className="grid max-w-5xl gap-8">
        <p className="max-w-prose text-lead text-pretty">{t('lead')}</p>
        {canEdit ? <SelfReturnSettingsForm shopName={shopName} settings={settings} /> : (
          <div className="grid max-w-xl gap-4">
            <p className="text-muted-foreground">{t('readOnly')}</p>
            {settings.allowed && settings.dropPoint !== null ? <DropPointCard shopName={shopName} dropPoint={settings.dropPoint} /> : <p>{t('off')}</p>}
          </div>
        )}
      </div>
    </ShopFrame>
  )
}
