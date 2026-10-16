import type { Region } from '@hold/domain'
import { useTranslations } from 'next-intl'
import { PhotoWithMarks } from '@/components/photo-with-marks'

export type ConditionItemView = {
  readonly itemId: string
  readonly label: string
  // Display copies, faces blurred. Null while the shop's worker prepares one.
  readonly photos: readonly { readonly view: string; readonly label: string; readonly url: string | null }[]
  readonly marks: readonly { readonly id: string; readonly view: string; readonly region: Region; readonly description: string }[]
  readonly added: readonly { readonly view: string; readonly url: string | null }[]
}

// One item as it left: its photographs, each mark boxed where staff found it, and what the renter added.
export function ConditionItem({ item }: { item: ConditionItemView }) {
  const t = useTranslations('renter.condition')
  return (
    <section aria-labelledby={`item-${item.itemId}`} className="grid gap-3">
      <h2 id={`item-${item.itemId}`} className="text-lg font-bold wrap-long-words">
        {item.label}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {item.photos.map((photo) => (
          <li key={photo.view} className="grid gap-1">
            {photo.url === null ? (
              <p className="grid aspect-[4/3] place-items-center border bg-muted p-3 text-sm text-muted-foreground">{t('preparing')}</p>
            ) : (
              <PhotoWithMarks src={photo.url} alt={t('photoOf', { item: item.label, view: photo.label })} marks={item.marks.filter((mark) => mark.view === photo.view)} />
            )}
            <span className="text-sm text-muted-foreground">{photo.label}</span>
          </li>
        ))}
      </ul>
      {item.marks.length === 0 ? <p className="text-muted-foreground">{t('noMarks')}</p> : (
        <ul className="grid list-disc gap-1 pl-5">
          {item.marks.map((mark) => (
            <li key={mark.id} className="wrap-long-words">{mark.description}</li>
          ))}
        </ul>
      )}
      {item.added.length === 0 ? null : <p className="font-semibold">{t('addedCount', { count: item.added.length })}</p>}
    </section>
  )
}
