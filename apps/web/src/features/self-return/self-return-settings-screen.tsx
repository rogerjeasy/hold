import type { SelfReturnSettings } from '@hold/domain'
import { useTranslations } from 'next-intl'
import { DropPointCard } from './return-intro'
import { SelfReturnSettingsForm } from './self-return-settings-form'

// Whether renters may return items with nobody at the counter (architecture.md section 6.13). The owner decides; other
// staff read what renters are told.
export function SelfReturnSettingsSection({ shopName, settings, canEdit }: { shopName: string; settings: SelfReturnSettings; canEdit: boolean }) {
  const t = useTranslations('selfReturn.settings')
  return (
    <section aria-labelledby="self-return-settings" className="grid gap-5">
      <div className="grid gap-2">
        <h2 id="self-return-settings" className="text-[1.375rem] leading-tight font-extrabold tracking-tight">{t('title')}</h2>
        <p className="max-w-prose text-pretty text-muted-foreground">{t('lead')}</p>
      </div>
      {canEdit ? <SelfReturnSettingsForm shopName={shopName} settings={settings} /> : (
        <div className="grid max-w-xl gap-4">
          <p className="text-muted-foreground">{t('readOnly')}</p>
          {settings.allowed && settings.dropPoint !== null ? <DropPointCard shopName={shopName} dropPoint={settings.dropPoint} /> : <p>{t('off')}</p>}
        </div>
      )}
    </section>
  )
}
