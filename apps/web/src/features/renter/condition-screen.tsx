import type { ConditionReply } from '@hold/domain'
import { useTranslations } from 'next-intl'
import { useShopFormat } from '@/hooks/use-shop-format'
import { CircleCheck, Clock } from 'lucide-react'
import { linkRoutes } from '@/lib/routes'
import { HandoverConfirmation } from '@/features/provenance/handover-confirmation'
import { ConditionAnswer } from './condition-answer'
import { ConditionItem } from './condition-item'
import { BackLink, RenterHead, RenterPage } from './renter-page'
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
    <RenterPage className="max-w-3xl">
      <RenterHead shopName={report.shopName} title={t('title')} lead={t('lead')}>
        {report.confirmed !== null ? (
          <HandoverConfirmation confirmed={report.confirmed} timeZone={report.timeZone} />
        ) : report.reply !== null ? (
          <p role="status" className="flex items-center gap-2 font-semibold"><CircleCheck aria-hidden="true" className="size-5 shrink-0 text-success" />{report.reply === 'confirmed' ? t('repliedConfirmed') : t('repliedAdded')}</p>
        ) : report.open ? (
          <p className="flex items-center gap-2 font-semibold"><Clock aria-hidden="true" className="size-4.5 shrink-0 text-primary" />{t('openUntil', { when: `${format.day(report.closesAt)}, ${format.time(report.closesAt)}` })}</p>
        ) : (
          <p className="text-muted-foreground">{t('closed')}</p>
        )}
      </RenterHead>
      {report.items.map((item) => (
        <ConditionItem key={item.itemId} item={item} token={token} timeZone={report.timeZone} />
      ))}
      {report.open && report.reply === null ? (
        report.canReply ? <ConditionAnswer token={token} items={report.items} /> : <p className="text-muted-foreground">{t('otherLink')}</p>
      ) : null}
      <BackLink href={`${linkRoutes.renter}/${token}`}>{t('back')}</BackLink>
    </RenterPage>
  )
}
