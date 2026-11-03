'use client'

import { Undo2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import type { ProposalRow } from './board'
import type { RowText } from './use-row-text'

type ReleaseBarProps = {
  releases: readonly ProposalRow[]
  text: RowText
  passkeyNeeded: boolean
  approve: (data: FormData) => void
  pending: boolean
  onClear: () => void
}

// The releases chosen on the board, approved in one tap through the morning queue's own server function, which
// refuses anything but releases together and checks the passkey again. What goes back to renters is summed from the
// amounts the records give.
export function ReleaseBar({ releases, text, passkeyNeeded, approve, pending, onClear }: ReleaseBarProps) {
  const t = useTranslations('decisions.together')
  const locale = useLocale()
  const backCents = releases.reduce((sum, row) => sum + (row.amountCents ?? 0), 0)
  return (
    <section aria-label={t('label')} className="sticky bottom-[calc(var(--shop-bottom-inset,0px)+1rem)] z-10 grid animate-pop gap-3 rounded-2xl border border-border-strong bg-card p-4 text-card-foreground shadow-overlay md:flex md:flex-wrap md:items-center md:justify-between md:p-5">
      <p className="flex min-w-0 items-center gap-3 font-semibold">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-success/12 text-success">
          <Undo2 className="size-4.5" />
        </span>
        <span className="min-w-0 wrap-long-words">{t('summary', { count: releases.length, amount: text.money(backCents) })}</span>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {passkeyNeeded ? (
          <p className="text-sm text-muted-foreground">{t('passkey')}</p>
        ) : (
          <form action={approve}>
            <input type="hidden" name="locale" value={locale} />
            {releases.map((row) => <input key={row.proposalId} type="hidden" name="proposalId" value={row.proposalId} />)}
            <Button type="submit" disabled={pending} className="whitespace-normal">{t('approve')}</Button>
          </form>
        )}
        <Button type="button" variant="outline" onClick={onClear}>{t('clear')}</Button>
      </div>
    </section>
  )
}
