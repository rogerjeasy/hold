import type { ConditionReply } from '@hold/domain'
import { useTranslations } from 'next-intl'
import { useShopFormat } from '@/hooks/use-shop-format'
import { Link } from '@/i18n/navigation'
import { linkRoutes } from '@/lib/routes'
import { HandoverConfirmation } from '@/features/provenance/handover-confirmation'
import { ConditionAnswer } from './condition-answer'
import { ConditionItem } from './condition-item'
import type { ConditionItemView } from './condition-item'

export type ConditionView = {
  readonly shopName: string
  readonly timeZone: string
  readonly open: boolean
  readonly reply: ConditionReply | null
  readonly closesAt: Date
  // Only the link sent at handover may answer. Others may look.
  readonly canReply: boolean
  // The renter's own answer, with when they gave it.
  readonly confirmed: { readonly reply: ConditionReply; readonly at: Date } | null
  readonly items: readonly ConditionItemView[]
}

// The condition report the renter is sent at handover (architecture.md section 11.2): how each item left, and a day to
// confirm it or add what staff missed, so they are never charged for it.
export function ConditionScreen({ token, report }: { token: string; report: ConditionView }) {
  const t = useTranslations('renter.condition')
  const format = useShopFormat({ timeZone: report.timeZone, currency: null })
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-8 md:px-8 md:py-12">
      <header className="grid gap-3">
        <p className="label text-xs text-muted-foreground wrap-long-words">{report.shopName}</p>
        <h1 className="text-page-title text-balance">{t('title')}</h1>
        <p className="max-w-prose text-lg text-pretty">{t('lead')}</p>
        {report.confirmed !== null ? (
          <HandoverConfirmation confirmed={report.confirmed} timeZone={report.timeZone} />
        ) : report.reply !== null ? (
          <p role="status" className="font-semibold">{report.reply === 'confirmed' ? t('repliedConfirmed') : t('repliedAdded')}</p>
        ) : report.open ? (
          <p className="text-muted-foreground">{t('openUntil', { when: `${format.day(report.closesAt)}, ${format.time(report.closesAt)}` })}</p>
        ) : (
          <p className="text-muted-foreground">{t('closed')}</p>
        )}
      </header>
      {report.items.map((item) => (
        <ConditionItem key={item.itemId} item={item} token={token} timeZone={report.timeZone} />
      ))}
      {report.open && report.reply === null ? (
        report.canReply ? <ConditionAnswer token={token} items={report.items} /> : <p className="text-muted-foreground">{t('otherLink')}</p>
      ) : null}
      <Link href={`${linkRoutes.renter}/${token}`} className="inline-flex min-h-11 items-center justify-self-start font-semibold underline underline-offset-4">
        {t('back')}
      </Link>
    </div>
  )
}
