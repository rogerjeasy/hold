import type { RentalAssistant } from '@hold/db'
import { Bot, CircleCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { useShopFormat } from '@/hooks/use-shop-format'
import { Link } from '@/i18n/navigation'
import { linkRoutes } from '@/lib/routes'
import { assistantState } from './assistant-state'
import { DisconnectForm } from './disconnect-form'

export type AssistantView = RentalAssistant & { readonly shopName: string; readonly timeZone: string; readonly currency: string }

// Everything a renter's assistant did on their rental, in plain words, and a way to disconnect it (extensions.md
// section 8.5, X3.7 and X3.8). The name is what the assistant called itself; nothing about it is verified.
export function AssistantScreen({ token, view }: { token: string; view: AssistantView }) {
  const t = useTranslations('renter.assistant')
  const state = assistantState({ connected: view.connected, revoked: view.revokedAt !== null })
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-8 md:px-8 md:py-12">
      <header className="grid gap-3">
        <p className="label text-xs text-muted-foreground wrap-long-words">{view.shopName}</p>
        <h1 className="flex items-start gap-2 text-page-title text-balance">
          <Bot aria-hidden="true" className="mt-1 size-7 shrink-0 text-primary" />
          {t(`title.${state}`)}
        </h1>
        <p className="max-w-prose text-pretty">
          {t.rich('name', { name: view.clientLabel === '' ? t('unnamed') : view.clientLabel, strong: (chunks) => <strong className="wrap-long-words">{chunks}</strong> })}
        </p>
        <p className="max-w-prose text-pretty text-muted-foreground">{t('lead')}</p>
        <Link href={`${linkRoutes.renter}/${token}`} referrerPolicy="no-referrer" className="inline-flex min-h-11 items-center justify-self-start font-semibold underline underline-offset-4">
          {t('back')}
        </Link>
      </header>
      {view.connected ? <DisconnectForm token={token} /> : null}
      {/* Read from the record, so it still shows once the page has reloaded after the renter disconnected it. */}
      {view.revokedAt === null ? null : (
        <p role="status" className="flex items-start gap-2 font-semibold">
          <CircleCheck aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-primary" />
          {t('disconnected')}
        </p>
      )}
      {view.draftReply === null ? null : <DraftReply draft={view.draftReply} />}
      <ActionList view={view} />
    </div>
  )
}

function DraftReply({ draft }: { draft: NonNullable<RentalAssistant['draftReply']> }) {
  const t = useTranslations('renter.assistant.draft')
  return (
    <Panel title={t('title')}>
      <div className="grid gap-2 px-4 py-3 md:px-5">
        <p className="font-semibold">{t(`decision.${draft.decision}`)}</p>
        {draft.comment === '' ? null : <blockquote className="border-l-2 pl-3 text-pretty wrap-long-words">{draft.comment}</blockquote>}
        <p className="text-sm text-muted-foreground">{t('note')}</p>
      </div>
    </Panel>
  )
}

function ActionList({ view }: { view: AssistantView }) {
  const t = useTranslations('renter.assistant')
  // The audit log names tools and outcomes as text; a name with no words of its own is shown as it is.
  type Key = Parameters<typeof t>[0]
  const words = (key: string): string | undefined => (t.has(key as Key) ? t(key as Key) : undefined)
  const format = useShopFormat({ timeZone: view.timeZone, currency: view.currency })
  return (
    <Panel title={t('did')}>
      {view.actions.length === 0 ? (
        <p className="px-4 py-3 text-muted-foreground md:px-5">{t('nothing')}</p>
      ) : (
        <ol aria-label={t('did')}>
          {view.actions.map((action, index) => (
            <li key={`${action.tool}-${String(index)}`} className="grid gap-0.5 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4 md:px-5">
              <span className="min-w-0 font-semibold wrap-long-words">
                {words(`tools.${action.tool}`) ?? action.tool}
                {action.outcome === 'ok' ? null : <span className="ml-2 font-normal text-muted-foreground">{words(`outcome.${action.outcome}`)}</span>}
              </span>
              <time dateTime={action.at.toISOString()} className="text-sm text-muted-foreground">
                {`${format.day(action.at)}, ${format.time(action.at)}`}
              </time>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}
