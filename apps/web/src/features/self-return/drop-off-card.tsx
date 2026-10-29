import type { Region } from '@hold/domain'
import { CircleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PhotoWithMarks } from '@/components/photo-with-marks'
import { SampleTag } from '@/components/ui/sample-tag'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'
import { DropOffActions } from './drop-off-actions'

type ShownPhoto = { readonly view: string; readonly url: string | null } | null

// An item a renter dropped off with nobody at the counter, with what a person needs to decide: when it came back, what
// the comparison found, the view to look at first beside its handover twin, and where the renter left it.
export type DropOffEntry = {
  readonly rentalId: string
  readonly renterName: string | null
  readonly droppedOffAt: Date
  readonly onTime: boolean
  readonly missingAt: Date | null
  readonly missingBy: string | null
  readonly holdCents: number | null
  readonly simulated: boolean
  readonly items: readonly {
    readonly label: string
    readonly views: number
    readonly findings: number
    readonly comparison: string | null
    readonly viewLabel: string | null
    readonly dropPoint: ShownPhoto
    readonly before: ShownPhoto
    readonly after: ShownPhoto
    readonly region: Region | null
  }[]
}

// What the overnight comparison says so far, when it found nothing to count.
const compared = (state: string | null) => (state === null || state === 'pending' || state === 'running' ? 'comparing' : state === 'clean' ? 'clean' : 'needsPerson')

function Photo({ photo, caption, region = null }: { photo: ShownPhoto; caption: string; region?: Region | null }) {
  return (
    <figure className="grid min-w-0 content-start gap-1.5">
      {photo?.url == null ? <span aria-hidden="true" className="aspect-thumbnail bg-muted" /> : region === null ? <img src={photo.url} alt={caption} className="aspect-thumbnail w-full object-cover" /> : <PhotoWithMarks src={photo.url} alt={caption} marks={[{ id: 'finding', region, confirmed: true }]} />}
      <figcaption className="label text-[0.6875rem] text-muted-foreground wrap-long-words">{caption}</figcaption>
    </figure>
  )
}

export function DropOffCard({ entry, clock, canAct }: { entry: DropOffEntry; clock: ShopClock; canAct: boolean }) {
  const t = useTranslations('selfReturn.staff')
  const format = useShopFormat(clock)
  const titleId = `drop-off-${entry.rentalId}`
  const labels = entry.items.map((item) => item.label).join(', ')
  return (
    <article aria-labelledby={titleId} className="grid min-w-0 gap-4 border border-l-4 border-l-primary bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <p className="label flex items-center gap-2 text-xs text-muted-foreground">{t('label')}{entry.simulated ? <SampleTag /> : null}</p>
          <h3 id={titleId} className="text-lg leading-snug font-extrabold tracking-tight wrap-long-words">{t('title', { items: labels, renter: entry.renterName ?? t('renterUnknown') })}</h3>
        </div>
        {entry.holdCents === null ? null : <p className="label shrink-0 border border-warning px-2 py-1 text-xs text-warning">{t('hold', { amount: format.money(entry.holdCents) })}</p>}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[0.9375rem] text-muted-foreground">
        <li>{entry.onTime ? t('returnedOnTime', { when: format.when(entry.droppedOffAt) }) : t('returnedLate', { when: format.when(entry.droppedOffAt) })}</li>
        <li>{t('views', { count: entry.items.reduce((sum, item) => sum + item.views, 0) })}</li>
        {entry.items.map((item) => (
          <li key={item.label}>
            {entry.items.length > 1 ? `${item.label}: ` : ''}
            {item.comparison === 'findings' ? t('findings', { count: item.findings }) : t(compared(item.comparison))}
          </li>
        ))}
      </ul>
      {entry.items.map((item) => (
        <div key={item.label} className="grid gap-3 sm:grid-cols-3">
          <Photo photo={item.before} caption={t('before', { view: item.viewLabel ?? '' })} />
          <Photo photo={item.after} caption={t('after', { view: item.viewLabel ?? '' })} region={item.region} />
          <Photo photo={item.dropPoint} caption={t('dropPoint')} />
        </div>
      ))}
      {entry.missingAt === null ? <p className="max-w-prose border-l-2 border-primary pl-3 text-pretty">{t('note')}</p> : (
        <p role="status" className="flex gap-2 font-semibold text-destructive">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
          {t('missing', { when: format.when(entry.missingAt), name: entry.missingBy ?? t('someone') })}
        </p>
      )}
      {canAct ? <DropOffActions rentalId={entry.rentalId} missing={entry.missingAt !== null} /> : <p className="text-muted-foreground">{t('readOnly')}</p>}
    </article>
  )
}
