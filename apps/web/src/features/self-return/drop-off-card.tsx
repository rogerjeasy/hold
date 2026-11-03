import type { Region } from '@hold/domain'
import { CircleAlert, MapPin } from 'lucide-react'
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
export const compared = (state: string | null) => (state === null || state === 'pending' || state === 'running' ? 'comparing' : state === 'clean' ? 'clean' : 'needsPerson')

export function DropOffPhoto({ photo, caption, region = null }: { photo: ShownPhoto; caption: string; region?: Region | null }) {
  return (
    <figure className="grid min-w-0 content-start gap-1.5">
      {/* Each shown whole, at its own shape, so the handover and the return of one view line up and a finding's box stays true. */}
      {photo?.url == null ? <span aria-hidden="true" className="aspect-thumbnail rounded-xl skeleton" /> : <PhotoWithMarks src={photo.url} alt={caption} marks={region === null ? [] : [{ id: 'finding', region, confirmed: true }]} />}
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
    <article aria-labelledby={titleId} className="surface relative grid min-w-0 animate-rise gap-5 overflow-hidden p-4 md:p-6">
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-primary" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <p className="label flex flex-wrap items-center gap-2 text-xs text-primary"><MapPin aria-hidden="true" className="size-3.5 shrink-0" />{t('label')}{entry.simulated ? <SampleTag /> : null}</p>
          <h3 id={titleId} className="text-xl leading-snug font-extrabold tracking-tight text-balance wrap-long-words">{t('title', { items: labels, renter: entry.renterName ?? t('renterUnknown') })}</h3>
        </div>
        {entry.holdCents === null ? null : <p className="shrink-0 rounded-full bg-warning/12 px-3 py-1.5 text-sm font-semibold text-warning tabular-nums">{t('hold', { amount: format.money(entry.holdCents) })}</p>}
      </div>
      <ul className="flex flex-wrap gap-2 text-sm">
        <li className="rounded-lg bg-muted/70 px-2.5 py-1">{entry.onTime ? t('returnedOnTime', { when: format.when(entry.droppedOffAt) }) : t('returnedLate', { when: format.when(entry.droppedOffAt) })}</li>
        <li className="rounded-lg bg-muted/70 px-2.5 py-1">{t('views', { count: entry.items.reduce((sum, item) => sum + item.views, 0) })}</li>
        {entry.items.map((item) => (
          <li key={item.label} className="rounded-lg bg-muted/70 px-2.5 py-1">
            {entry.items.length > 1 ? `${item.label}: ` : ''}
            {item.comparison === 'findings' ? t('findings', { count: item.findings }) : t(compared(item.comparison))}
          </li>
        ))}
      </ul>
      {entry.items.map((item) => (
        <div key={item.label} className="grid gap-3 sm:grid-cols-3">
          <DropOffPhoto photo={item.before} caption={t('before', { view: item.viewLabel ?? '' })} />
          <DropOffPhoto photo={item.after} caption={t('after', { view: item.viewLabel ?? '' })} region={item.region} />
          <DropOffPhoto photo={item.dropPoint} caption={t('dropPoint')} />
        </div>
      ))}
      {entry.missingAt === null ? <p className="max-w-prose text-pretty text-muted-foreground">{t('note')}</p> : (
        <p role="status" className="flex gap-2 rounded-xl bg-destructive/8 px-3.5 py-2.5 font-semibold text-destructive">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
          {t('missing', { when: format.when(entry.missingAt), name: entry.missingBy ?? t('someone') })}
        </p>
      )}
      {canAct ? <DropOffActions rentalId={entry.rentalId} missing={entry.missingAt !== null} /> : <p className="text-muted-foreground">{t('readOnly')}</p>}
    </article>
  )
}
