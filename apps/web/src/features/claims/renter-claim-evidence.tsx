import type { Region } from '@hold/domain'
import { ChevronRight, Images, ListChecks } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PhotoWithMarks } from '@/components/photo-with-marks'
import { PhotoProvenance } from '@/features/provenance/photo-provenance'
import type { ProvenanceView } from '@/features/provenance/photo-provenance'

export type ItemPhotos = { readonly itemId: string; readonly label: string; readonly views: readonly { readonly view: string; readonly label: string; readonly beforeUrl: string | null; readonly afterUrl: string | null; readonly beforeProvenance?: ProvenanceView | null; readonly afterProvenance?: ProvenanceView | null }[] }

type Side = { readonly url: string | null; readonly provenance: ProvenanceView | null }

// One evidence photograph in a rounded frame, its caption above in the small label type and, under it, where it came
// from and its seal. A finding's box is drawn where it was found.
function EvidenceFrame({ caption, alt, url, provenance, region, timeZone }: { caption: string; alt: string; url: string; provenance: ProvenanceView | null; region: Region | null; timeZone: string }) {
  return (
    <figure className="grid min-w-0 content-start gap-2">
      <figcaption className="label text-xs text-muted-foreground">{caption}</figcaption>
      <div className="overflow-hidden rounded-xl bg-photo shadow-xs [&>div]:border-0">
        <PhotoWithMarks src={url} alt={alt} marks={region === null ? [] : [{ id: 'finding', region }]} />
      </div>
      {provenance === null ? null : <PhotoProvenance provenance={provenance} timeZone={timeZone} />}
    </figure>
  )
}

// The same view at handover and at return, side by side from a small tablet up and one above the other on a phone.
// Compact, for an item's many views: always side by side, with where they came from folded under the pair.
export function PhotoPair({ subject, before, after, region = null, timeZone, compact = false }: { subject: string; before: Side; after: Side; region?: Region | null; timeZone: string; compact?: boolean }) {
  const t = useTranslations('claim')
  const page = useTranslations('claim.renterPage')
  const sides = ([['beforeUrl', before], ['afterUrl', after]] as const).filter(([, side]) => side.url !== null)
  const sealed = sides.filter(([, side]) => side.provenance !== null)
  return (
    <div className="grid gap-3">
      <div className={compact ? 'grid grid-cols-2 gap-2.5 sm:gap-4' : 'grid gap-4 sm:grid-cols-2'}>
        {sides.map(([caption, side]) => (side.url === null ? null : <EvidenceFrame key={caption} caption={t(caption)} alt={`${t(caption)}: ${subject}`} url={side.url} provenance={compact ? null : side.provenance} region={caption === 'afterUrl' ? region : null} timeZone={timeZone} />))}
      </div>
      {compact && sealed.length > 0 ? (
        <details className="group text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 font-semibold text-muted-foreground marker:content-none hover:text-foreground">
            <ChevronRight aria-hidden="true" className="size-4 transition-transform duration-200 ease-swift group-open:rotate-90" />
            {page('provenance')}
          </summary>
          <div className="grid gap-4 pt-2 sm:grid-cols-2">
            {sealed.map(([caption, side]) => (side.provenance === null ? null : (
              <div key={caption} className="grid content-start gap-1.5">
                <p className="label text-[0.6875rem] text-muted-foreground">{t(caption)}</p>
                <PhotoProvenance provenance={side.provenance} timeZone={timeZone} />
              </div>
            )))}
          </div>
        </details>
      ) : null}
    </div>
  )
}

// For a line a person added without a photograph pair of its own: what each item looked like when it left and when it
// came back, view by view, so the renter can see for themselves.
export function ItemPhotoPairs({ items, timeZone }: { items: readonly ItemPhotos[]; timeZone: string }) {
  const t = useTranslations('claim.renterPage')
  if (items.length === 0) return <p className="flex items-start gap-2 text-sm text-muted-foreground"><ListChecks aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('noPhotos')}</p>
  return (
    <div className="grid gap-4 rounded-xl bg-muted/50 p-3 md:p-4">
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Images aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <span className="min-w-0">{t('itemPhotosLead')}</span>
      </p>
      {items.map((item) => (
        <div key={item.itemId} className="grid gap-4">
          {items.length > 1 ? <p className="font-semibold wrap-long-words">{item.label}</p> : null}
          {item.views.map((view) => (
            <div key={view.view} className="grid gap-2">
              <p className="text-sm font-semibold wrap-long-words">{view.label}</p>
              <PhotoPair subject={`${item.label}, ${view.label}`} before={{ url: view.beforeUrl, provenance: view.beforeProvenance ?? null }} after={{ url: view.afterUrl, provenance: view.afterProvenance ?? null }} timeZone={timeZone} compact />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
