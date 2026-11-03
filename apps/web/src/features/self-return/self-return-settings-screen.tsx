import type { SelfReturnSettings } from '@hold/domain'
import { DoorOpen } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SettingsCard } from '@/components/ui/settings-card'
import { DropPointCard } from './return-intro'
import { SelfReturnSettingsForm } from './self-return-settings-form'

// Whether renters may return items with nobody at the counter (architecture.md section 6.13). The owner decides; other
// staff read what renters are told.
export function SelfReturnSettingsSection({ shopName, settings, canEdit }: { shopName: string; settings: SelfReturnSettings; canEdit: boolean }) {
  const t = useTranslations('selfReturn.settings')
  return (
    <SettingsCard title={t('title')} lead={t('lead')} icon={DoorOpen}>
      {canEdit ? <SelfReturnSettingsForm shopName={shopName} settings={settings} /> : (
        <div className="grid max-w-xl gap-4">
          <p className="text-muted-foreground">{t('readOnly')}</p>
          {settings.allowed && settings.dropPoint !== null ? <DropPointCard shopName={shopName} dropPoint={settings.dropPoint} /> : <p>{t('off')}</p>}
        </div>
      )}
    </SettingsCard>
  )
}
