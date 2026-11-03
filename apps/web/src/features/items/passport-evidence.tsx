import type { PassportMark, PassportSession } from '@hold/db'
import type { PhotoPlanView } from '@hold/db'
import { Camera, Focus, Link2, Lock, LockOpen, ScanSearch } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { StatusPill } from '@/components/ui/status-pill'
import type { StatusTone } from '@/components/ui/status-pill'
import { OutlineOverlay } from '@/features/handover/outline-overlay'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'

const MARK_TONES: Readonly<Record<PassportMark['status'], StatusTone>> = { open: 'attention', repaired: 'success', reported: 'progress' }

// The marks already on the item, so no renter is charged for them (architecture.md section 9.4).
export function PassportMarks({ marks, views, clock }: { marks: readonly PassportMark[]; views: readonly PhotoPlanView[]; clock: ShopClock }) {
  const t = useTranslations('shop.items.passport.marks')
  const format = useShopFormat(clock)
  return (
    <Panel title={t('title')} icon={ScanSearch} aside={marks.length === 0 ? null : <span className="figures text-sm text-muted-foreground">{marks.length}</span>}>
      {marks.length === 0 ? (
        <p className="px-4 py-5 text-muted-foreground md:px-5">{t('empty')}</p>
      ) : (
        <ul className="stagger">
          {marks.map((mark) => (
            <li key={mark.id} className="grid gap-1.5 border-b border-border/70 px-4 py-3.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-x-4 md:px-5">
              <div className="min-w-0">
                <p className="font-semibold wrap-long-words">{mark.description}</p>
                <p className="mt-0.5 text-sm text-muted-foreground wrap-long-words">
                  {views.find((view) => view.key === mark.view)?.label ?? mark.view} · {t('firstSeen', { date: format.day(mark.firstSeenAt) })}
                </p>
              </div>
              <StatusPill tone={MARK_TONES[mark.status]} className="justify-self-start">
                {mark.status === 'repaired' && mark.closedAt !== null ? t('repairedOn', { date: format.day(mark.closedAt) }) : t(mark.status)}
              </StatusPill>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

// The item's sealed photo sessions, newest first. Each names the one before it, which makes the chain: drawn as a line
// down the left, a link for every session.
export function PassportSessions({ sessions, clock }: { sessions: readonly PassportSession[]; clock: ShopClock }) {
  const t = useTranslations('shop.items.passport.sessions')
  const format = useShopFormat(clock)
  return (
    <Panel title={t('title')} icon={Camera} aside={sessions.length === 0 ? null : <span className="figures text-sm text-muted-foreground">{sessions.length}</span>}>
      {sessions.length === 0 ? (
        <p className="px-4 py-5 text-muted-foreground md:px-5">{t('empty')}</p>
      ) : (
        <ol className="stagger px-4 py-4 md:px-5">
          {sessions.map((session) => {
            const sealed = session.sealedAt !== null
            const Icon = sealed ? Lock : LockOpen
            return (
              <li key={session.id} className="group/session relative grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 pb-5 last:pb-0">
                {/* The chain between this session and the one before it. */}
                <span aria-hidden="true" className="absolute top-9 bottom-0 left-4.5 w-px bg-border-strong/60 group-last/session:hidden" />
                <span aria-hidden="true" className={`grid size-9 place-items-center rounded-xl ${sealed ? 'bg-success/12 text-success' : 'bg-muted text-muted-foreground'}`}>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 pt-1">
                  <p className="font-semibold">
                    {t(`kinds.${session.kind as 'handover'}`)} · {t('photographs', { count: session.photographs })}
                  </p>
                  <p className="text-sm text-muted-foreground">{session.sealedAt !== null ? t('sealed', { date: format.day(session.sealedAt) }) : t('open')}</p>
                  {session.manifestFingerprint === null ? null : (
                    <p className="figures mt-1 flex min-w-0 items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
                      <Link2 aria-hidden="true" className="size-3.5 shrink-0" />
                      <span className="truncate">{t('fingerprint', { value: session.manifestFingerprint.slice(0, 16) })}</span>
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </Panel>
  )
}

// The views this item is photographed to at each handover and return: each as the frame staff line the camera up in.
export function PassportPlan({ views }: { views: readonly PhotoPlanView[] }) {
  const t = useTranslations('shop.items.passport.plan')
  const outlines = useTranslations('shop.items.outlines')
  return (
    <Panel title={t('title')} icon={Focus}>
      <p className="px-4 pt-3 text-sm text-muted-foreground md:px-5">{t('lead')}</p>
      <ol className="stagger grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:px-5">
        {views.map((view, index) => (
          <li key={view.key} className="min-w-0">
            <div className="relative aspect-thumbnail overflow-hidden rounded-xl bg-photo text-photo-foreground shadow-xs">
              <div aria-hidden="true" className="absolute inset-0 dot-grid opacity-25" />
              <OutlineOverlay outline={view.outline} />
              <span className="figures absolute top-2 left-2 grid size-6 place-items-center rounded-md bg-photo-scrim text-xs">{index + 1}</span>
              {view.required ? null : <span className="absolute top-2 right-2 rounded-md bg-photo-scrim px-1.5 py-0.5 text-[0.6875rem] font-semibold">{t('optional')}</span>}
            </div>
            <p className="mt-1.5 text-sm leading-snug font-semibold wrap-long-words">{view.label}</p>
            <p className="label text-[0.6875rem] text-muted-foreground">{outlines(view.outline)}</p>
          </li>
        ))}
      </ol>
    </Panel>
  )
}
