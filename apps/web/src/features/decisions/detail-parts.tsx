import { Lock, Quote, UserCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { BoardRow } from './board'
import type { RowText } from './use-row-text'

// A renter's own words, quoted as data and never acted on.
export function RenterWords({ words }: { words: string }) {
  const t = useTranslations('decisions.detail')
  return (
    <figure className="grid gap-1.5">
      <figcaption className="label text-xs text-muted-foreground">{t('renterWrote')}</figcaption>
      <blockquote className="relative rounded-xl border border-border/70 bg-card py-3 pr-4 pl-10 whitespace-pre-wrap italic wrap-long-words">
        <Quote aria-hidden="true" className="absolute top-3.5 left-3.5 size-4 text-muted-foreground" />
        {words}
      </blockquote>
    </figure>
  )
}

// Who decides, beside the decision. When it is not the viewer, it says why there is nothing here for them to press,
// so a button they may not use is never shown and never missed (who may decide is the domain's rule, in board.ts).
export function DeciderNote({ row, text }: { row: BoardRow; text: RowText }) {
  const reason = text.notYours(row)
  if (reason === null) {
    return (
      <p className="flex items-center gap-2.5 font-semibold">
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-success/12 text-success">
          <UserCheck className="size-4" />
        </span>
        {text.deciderLine(row)}
      </p>
    )
  }
  return (
    <div className="flex gap-3 rounded-xl border border-border/70 bg-card p-3.5">
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Lock className="size-4" />
      </span>
      <div className="min-w-0 self-center wrap-long-words">
        <p className="font-semibold">{text.deciderLine(row)}</p>
        <p className="text-sm text-muted-foreground">{reason}</p>
      </div>
    </div>
  )
}
