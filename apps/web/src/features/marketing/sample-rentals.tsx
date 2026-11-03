import { useTranslations } from 'next-intl'
import { EvidenceMarks } from './evidence-marks'
import { evidencePhoto } from './evidence-photo'
import type { OutcomeKey } from './example-rental'
import { HoldCard } from './hold-card'
import { PhotoCrop } from './photo-crop'

// The contested claim has no outcome yet: its hold stays whole until the owner decides.
const samples: readonly { key: 'clean' | 'scratch' | 'contested'; outcome: OutcomeKey | undefined; damaged: boolean }[] = [
  { key: 'clean', outcome: 'clean', damaged: false },
  { key: 'scratch', outcome: 'damage', damaged: true },
  { key: 'contested', outcome: undefined, damaged: true },
]

export function SampleRentals() {
  const t = useTranslations('pages.demo.samples.items')
  const evidence = useTranslations('evidence')

  return (
    <ul role="list" className="stagger grid gap-4 md:grid-cols-3 lg:gap-6">
      {samples.map(({ key, outcome, damaged }) => (
        <li key={key} className="group surface flex flex-col overflow-clip">
          <div className="relative aspect-thumbnail overflow-hidden bg-photo">
            <PhotoCrop
              viewBox={evidencePhoto.thumbnailViewBox}
              src={damaged ? evidencePhoto.returnSrc : evidencePhoto.handoverSrc}
              className="transition-transform duration-700 ease-spring group-hover:scale-[1.04]"
            >
              <EvidenceMarks showNew={damaged} newLabel={evidence('newTag')} />
            </PhotoCrop>
          </div>
          <div className="flex flex-1 flex-col gap-3 p-5 md:p-6">
            <p className="label self-start rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">{t(`${key}.result`)}</p>
            <h3 className="text-title wrap-long-words">{t(`${key}.title`)}</h3>
            <p className="text-muted-foreground">{t(`${key}.body`)}</p>
            <HoldCard outcome={outcome} className="mt-auto bg-background shadow-none" />
          </div>
        </li>
      ))}
    </ul>
  )
}
