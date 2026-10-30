import type { PassportMark, PassportSession } from '@hold/db'
import type { PhotoPlanView } from '@hold/db'
import { Link2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'

// The marks already on the item, so no renter is charged for them (architecture.md section 9.4).
export function PassportMarks({ marks, views, clock }: { marks: readonly PassportMark[]; views: readonly PhotoPlanView[]; clock: ShopClock }) {
  const t = useTranslations('shop.items.passport.marks')
  const format = useShopFormat(clock)
  return (
    <Panel title={t('title')}>
      {marks.length === 0 ? (
        <p className="px-4 py-5 text-muted-foreground md:px-5">{t('empty')}</p>
      ) : (
        <ul>
          {marks.map((mark) => (
            <li key={mark.id} className="grid gap-0.5 border-b px-4 py-3.5 last:border-b-0 md:px-5">
              <p className="font-semibold wrap-long-words">{mark.description}</p>
              <p className="text-sm text-muted-foreground">
                {views.find((view) => view.key === mark.view)?.label ?? mark.view} · {t('firstSeen', { date: format.day(mark.firstSeenAt) })} · {mark.status === 'repaired' && mark.closedAt !== null ? t('repairedOn', { date: format.day(mark.closedAt) }) : t(mark.status)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

// The item's sealed photo sessions, newest first. Each names the one before it, which makes the chain.
export function PassportSessions({ sessions, clock }: { sessions: readonly PassportSession[]; clock: ShopClock }) {
  const t = useTranslations('shop.items.passport.sessions')
  const format = useShopFormat(clock)
  return (
    <Panel title={t('title')}>
      {sessions.length === 0 ? (
        <p className="px-4 py-5 text-muted-foreground md:px-5">{t('empty')}</p>
      ) : (
        <ol>
          {sessions.map((session) => (
            <li key={session.id} className="grid gap-0.5 border-b px-4 py-3.5 last:border-b-0 md:px-5">
              <p className="font-semibold">
                {t(`kinds.${session.kind as 'handover'}`)} · {t('photographs', { count: session.photographs })}
              </p>
              <p className="text-sm text-muted-foreground">{session.sealedAt === null ? t('open') : t('sealed', { date: format.day(session.sealedAt) })}</p>
              {session.manifestFingerprint === null ? null : (
                <p className="figures flex min-w-0 items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
                  <Link2 aria-hidden="true" className="size-3.5 shrink-0" />
                  <span className="truncate">{t('fingerprint', { value: session.manifestFingerprint.slice(0, 16) })}</span>
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}

// The views this item is photographed to at each handover and return.
export function PassportPlan({ views }: { views: readonly PhotoPlanView[] }) {
  const t = useTranslations('shop.items.passport.plan')
  const outlines = useTranslations('shop.items.outlines')
  return (
    <Panel title={t('title')}>
      <p className="border-b px-4 py-3 text-sm text-muted-foreground md:px-5">{t('lead')}</p>
      <ol>
        {views.map((view, index) => (
          <li key={view.key} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-2 border-b px-4 py-2.5 last:border-b-0 md:px-5">
            <span className="figures text-sm text-muted-foreground">{index + 1}</span>
            <span className="min-w-0">
              <span className="font-semibold wrap-long-words">{view.label}</span>
              <span className="block text-sm text-muted-foreground">
                {outlines(view.outline)}
                {view.required ? null : ` · ${t('optional')}`}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  )
}
