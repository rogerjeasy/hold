import type { Region } from '@hold/domain'
import { useTranslations } from 'next-intl'
import { PhotoWithMarks } from '@/components/photo-with-marks'
import { CheckEvidence } from '@/features/provenance/check-evidence'
import { PhotoProvenance } from '@/features/provenance/photo-provenance'
import type { ProvenanceView } from '@/features/provenance/photo-provenance'

export type ConditionItemView = {
  readonly itemId: string
  readonly label: string
  // Display copies, faces blurred. Null while the shop's worker prepares one.
  readonly photos: readonly { readonly view: string; readonly label: string; readonly url: string | null; readonly provenance: ProvenanceView | null }[]
  readonly marks: readonly { readonly id: string; readonly view: string; readonly region: Region; readonly description: string }[]
  readonly added: readonly { readonly view: string; readonly url: string | null }[]
}

// One item as it left: its photographs, each with where it came from and its seal, each mark boxed where staff found
// it, what the renter added, and a way to check the item's evidence on /verify.
export function ConditionItem({ item, token, timeZone }: { item: ConditionItemView; token: string; timeZone: string }) {
  const t = useTranslations('renter.condition')
  return (
    <section aria-labelledby={`item-${item.itemId}`} className="surface grid min-w-0 animate-rise gap-4 p-4 md:p-5">
      <h2 id={`item-${item.itemId}`} className="text-[1.0625rem] leading-tight font-extrabold tracking-tight wrap-long-words">
        {item.label}
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2">
        {item.photos.map((photo) => (
          <li key={photo.view} className="grid min-w-0 content-start gap-2">
            {photo.url === null ? (
              <p className="skeleton grid aspect-thumbnail place-items-center rounded-xl p-3 text-sm text-muted-foreground">{t('preparing')}</p>
            ) : (
              <div className="overflow-hidden rounded-xl bg-photo shadow-xs [&>div]:border-0">
                <PhotoWithMarks src={photo.url} alt={t('photoOf', { item: item.label, view: photo.label })} marks={item.marks.filter((mark) => mark.view === photo.view)} />
              </div>
            )}
            <span className="label text-xs text-muted-foreground">{photo.label}</span>
            {photo.provenance === null ? null : <PhotoProvenance provenance={photo.provenance} timeZone={timeZone} />}
          </li>
        ))}
      </ul>
      {item.marks.length === 0 ? <p className="text-muted-foreground">{t('noMarks')}</p> : (
        <ul className="grid gap-2 rounded-xl bg-muted/60 p-3 md:p-4">
          {item.marks.map((mark) => (
            <li key={mark.id} className="flex items-start gap-2.5 wrap-long-words">
              <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-sm border-2 border-mark" />
              <span className="min-w-0">{mark.description}</span>
            </li>
          ))}
        </ul>
      )}
      {item.added.length === 0 ? null : <p className="font-semibold">{t('addedCount', { count: item.added.length })}</p>}
      <CheckEvidence token={token} itemId={item.itemId} />
    </section>
  )
}
