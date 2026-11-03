import { CircleCheck, CircleHelp, CircleMinus, ScanSearch } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { EvidenceMarks } from './evidence-marks'
import { evidencePhoto } from './evidence-photo'
import { PhotoCrop } from './photo-crop'

// The answers the comparison can give. The last one is as much an answer as the first three.
const findings = [
  { key: 'damage', crop: 'scratch', icon: ScanSearch, iconClass: 'text-primary', confidence: 'high', marks: 'new' },
  { key: 'wear', crop: 'tyre', icon: CircleMinus, iconClass: 'text-muted-foreground', confidence: 'high', marks: 'none' },
  { key: 'same', crop: 'scuff', icon: CircleCheck, iconClass: 'text-success', confidence: 'high', marks: 'old' },
  { key: 'unsure', crop: 'brake', icon: CircleHelp, iconClass: 'text-muted-foreground', confidence: 'low', marks: 'none' },
] as const

export function FindingCards() {
  const t = useTranslations('pages.ai.findings')
  const evidence = useTranslations('evidence')

  return (
    <figure>
      <ul role="list" className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {findings.map(({ key, crop, icon: Icon, iconClass, confidence, marks }) => (
          <li key={key} className="group surface flex flex-col overflow-clip">
            <div className="relative aspect-thumbnail overflow-hidden bg-photo">
              <PhotoCrop viewBox={evidencePhoto.crops[crop]} className="transition-transform duration-700 ease-spring group-hover:scale-[1.04]">
                {marks === 'none' ? null : <EvidenceMarks showNew={marks === 'new'} newLabel={evidence('newTag')} />}
              </PhotoCrop>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-5">
              <p className="label flex items-center gap-2 text-[0.8125rem]">
                <Icon aria-hidden="true" className={`size-4.5 shrink-0 ${iconClass}`} />
                {t(`items.${key}.verdict`)}
              </p>
              <h3 className="text-xl leading-tight font-bold tracking-tight wrap-long-words">{t(`items.${key}.title`)}</h3>
              <p className="text-muted-foreground">{t(`items.${key}.body`)}</p>
              <p className="figures mt-auto self-start rounded-full bg-muted px-3 py-1 text-[0.8125rem]">{t(confidence)}</p>
            </div>
          </li>
        ))}
      </ul>
      <figcaption className="mt-4 text-[0.9375rem] text-muted-foreground">{t('caption')}</figcaption>
    </figure>
  )
}
