import type { ClaimWorkspace } from '@hold/db'
import { formatMoney, money } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { PhotoWithMarks } from '@/components/photo-with-marks'

type Line = ClaimWorkspace['lines'][number]

// Each line of a claim as a card: the price and its amount, why it applies and who named it, and its evidence, the
// handover photograph beside the return one. A line's box is drawn only on the photograph it was found or drawn on.
export function ClaimLines({ lines, currency, photoUrls }: { lines: readonly Line[]; currency: string; photoUrls: Readonly<Record<string, string>> }) {
  const t = useTranslations('claim')
  const locale = useLocale()
  const amount = (cents: number) => formatMoney(money(cents, currency), locale)
  if (lines.length === 0) return null
  return (
    <ul className="stagger grid gap-4">
      {lines.map((line) => {
        const photos = (['beforeKey', 'afterKey'] as const).flatMap((side) => {
          const key = line[side]
          const url = key === null ? undefined : photoUrls[key]
          return url === undefined ? [] : [{ side, url, label: t(side === 'beforeKey' ? 'beforeUrl' : 'afterUrl') }]
        })
        return (
          <li key={line.id} className="grid min-w-0 gap-4 rounded-2xl border border-border/70 bg-background/60 p-4 md:p-5">
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="min-w-0 text-[1.0625rem] font-extrabold tracking-tight wrap-long-words">{line.description}</p>
              <p className="text-xl font-extrabold tracking-tight tabular-nums">{amount(line.amountCents)}</p>
            </div>
            {line.source === 'agreed_in_rental' ? <p className="justify-self-start rounded-lg bg-success/10 px-2.5 py-1 text-sm font-semibold text-success">{t('agreed.drafted')}</p> : null}
            <div className="grid gap-1">
              <p className="whitespace-pre-wrap text-pretty wrap-long-words">{line.reason ?? line.findingDescription ?? line.incidentDescription}</p>
              <p className="text-sm text-muted-foreground">{t('namedBy', { name: line.actorName ?? t('staff') })}</p>
            </div>
            {photos.length === 0 ? null : (
              <div className="grid gap-3 sm:grid-cols-2">
                {photos.map((photo) => (
                  <figure key={photo.side} className="grid min-w-0 content-start gap-2">
                    <figcaption className="label text-xs text-muted-foreground">{photo.label}</figcaption>
                    <PhotoWithMarks src={photo.url} alt={photo.label} marks={line.region === null || photo.side === 'beforeKey' ? [] : [{ id: line.id, region: line.region }]} />
                  </figure>
                ))}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
