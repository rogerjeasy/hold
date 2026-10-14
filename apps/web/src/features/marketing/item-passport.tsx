import { useFormatter, useTranslations } from 'next-intl'
import { EvidenceMarks } from './evidence-marks'
import { evidencePhoto } from './evidence-photo'
import { exampleRental } from './example-rental'
import { PhotoCrop } from './photo-crop'
import { useExampleMoney } from './use-example-money'

// One item's condition over time. Each entry is dated, so an old mark can never be charged to a new renter.
export function ItemPassport() {
  const t = useTranslations('pages.forShops.passport')
  const shop = useTranslations('bothSides.shop')
  const evidence = useTranslations('evidence')
  const format = useFormatter()
  const money = useExampleMoney()
  const day = (date: Date) => format.dateTime(date, { year: 'numeric', month: 'short', day: 'numeric' })
  const entries = [
    {
      key: 'scuff',
      date: exampleRental.scuffFirstSeenAt,
      title: t('entries.scuff.title'),
      note: t('entries.scuff.note'),
      crop: evidencePhoto.crops.scuff,
      src: evidencePhoto.handoverSrc,
      showNew: false,
    },
    {
      key: 'handover',
      date: exampleRental.handoverAt,
      title: t('entries.handover.title', { number: exampleRental.holdNumber }),
      note: t('entries.handover.note', { count: exampleRental.photographCount }),
      crop: evidencePhoto.crops.frame,
      src: evidencePhoto.handoverSrc,
      showNew: false,
    },
    {
      key: 'scratch',
      date: exampleRental.returnAt,
      title: t('entries.scratch.title'),
      note: t('entries.scratch.note', { amount: money(exampleRental.outcomes.damage.takenCents) }),
      crop: evidencePhoto.crops.scratch,
      src: evidencePhoto.returnSrc,
      showNew: true,
    },
  ] as const

  return (
    <figure className="border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b px-4 py-3 md:px-5">
        <p className="font-bold">{shop('item')}</p>
        <p className="label text-xs text-muted-foreground">{t('label')}</p>
      </div>
      <ol role="list" className="px-4 md:px-5">
        {entries.map((entry) => (
          <li key={entry.key} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-4 border-b py-4 last:border-b-0 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
            <div className="relative aspect-thumbnail overflow-hidden bg-photo">
              <PhotoCrop viewBox={entry.crop} src={entry.src}>
                <EvidenceMarks showNew={entry.showNew} newLabel={evidence('newTag')} />
              </PhotoCrop>
            </div>
            <div>
              <p className="figures text-[0.8125rem] text-muted-foreground">{day(entry.date)}</p>
              <p className="mt-0.5 text-[1.0625rem] leading-snug font-bold">{entry.title}</p>
              <p className="mt-0.5 text-[0.9375rem] text-muted-foreground">{entry.note}</p>
            </div>
          </li>
        ))}
      </ol>
      <figcaption className="border-t px-4 py-2.5 text-sm text-muted-foreground md:px-5">{t('caption')}</figcaption>
    </figure>
  )
}
