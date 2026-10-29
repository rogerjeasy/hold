import { CircleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { DropOffActions } from '@/features/self-return/drop-off-actions'
import { compared, DropOffPhoto } from '@/features/self-return/drop-off-card'
import type { DropOffRow } from './board'
import type { RowText } from './use-row-text'

type DropOffDetailProps = { row: DropOffRow; text: RowText; photoUrls: Readonly<Record<string, string>> }

// What a renter dropped off with nobody at the counter, as the morning queue shows it: when it came back, what the
// comparison found, the view to look at first beside its handover twin, and where it was left. Then the same two
// choices: it is here and the return is reviewed, or it is not and that is recorded. The hold stays either way.
export function DropOffDetail({ row, text, photoUrls }: DropOffDetailProps) {
  const t = useTranslations('selfReturn.staff')
  const shown = (photo: { readonly view: string; readonly displayKey: string | null } | null) =>
    photo === null ? null : { view: photo.view, url: photo.displayKey === null ? null : (photoUrls[photo.displayKey] ?? null) }
  return (
    <>
      <ul className="grid gap-1 text-[0.9375rem]">
        <li>{row.onTime ? t('returnedOnTime', { when: text.moment(row.droppedOffAt) }) : t('returnedLate', { when: text.moment(row.droppedOffAt) })}</li>
        {row.items.map((item) => (
          <li key={item.label} className="wrap-long-words">
            {row.items.length > 1 ? `${item.label}: ` : ''}
            {item.comparison === 'findings' ? t('findings', { count: item.findings }) : t(compared(item.comparison))}
          </li>
        ))}
      </ul>
      {row.items.map((item) => (
        <div key={item.label} className="grid gap-3 @md:grid-cols-3">
          <DropOffPhoto photo={shown(item.before)} caption={t('before', { view: item.viewLabel ?? '' })} />
          <DropOffPhoto photo={shown(item.after)} caption={t('after', { view: item.viewLabel ?? '' })} region={item.region} />
          <DropOffPhoto photo={shown(item.dropPoint)} caption={t('dropPoint')} />
        </div>
      ))}
      {row.missingAt === null ? <p className="border-l-2 border-primary pl-3 text-pretty">{t('note')}</p> : (
        <p role="status" className="flex gap-2 font-semibold text-destructive">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
          {t('missing', { when: text.moment(row.missingAt), name: row.missingBy ?? t('someone') })}
        </p>
      )}
      {row.decider === 'you' ? <DropOffActions rentalId={row.rentalId} missing={row.missingAt !== null} /> : <p className="text-muted-foreground">{t('readOnly')}</p>}
    </>
  )
}
