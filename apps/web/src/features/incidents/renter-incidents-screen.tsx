import type { IncidentKind, IncidentState } from '@hold/domain'
import { ChevronRight, Siren } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { BackLink, RenterHead, RenterPage } from '@/features/renter/renter-page'
import { Link } from '@/i18n/navigation'
import { linkRoutes } from '@/lib/routes'
import { IncidentStartForm } from './incident-start-form'
import type { ReportableItem } from './incident-start-form'

export type EarlierReport = { readonly id: string; readonly state: IncidentState; readonly kind: IncidentKind | null; readonly itemLabel: string; readonly reportedAt: string }

// "Something happened": a new report while the renter has the items, and the reports they made before.
export function RenterIncidentsScreen({ token, shopName, open, items, earlier }: { token: string; shopName: string; open: boolean; items: readonly ReportableItem[]; earlier: readonly EarlierReport[] }) {
  const t = useTranslations('renter.incident')
  return (
    <RenterPage>
      <RenterHead shopName={shopName} title={t('title')} lead={t('lead')} />
      <p className="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/8 p-4 font-semibold text-pretty">
        <Siren aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
        <span className="min-w-0">{t('emergencyFirst')}</span>
      </p>
      {open ? <Panel title={t('newReport')}><div className="p-4 md:p-5"><IncidentStartForm token={token} items={items} /></div></Panel> : <p className="surface p-4 text-muted-foreground md:p-5">{t('closed')}</p>}
      {earlier.length === 0 ? null : (
        <Panel title={t('earlier')}>
          <ul className="divide-y divide-border/70">
            {earlier.map((report) => (
              <li key={report.id}>
                <Link href={linkRoutes.incident(token, report.id)} referrerPolicy="no-referrer" className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-foreground/3 md:px-5">
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="font-semibold wrap-long-words">{report.itemLabel}</span>
                    <span className="text-sm text-muted-foreground">{t(`states.${report.state}`)}</span>
                  </span>
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-swift group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <BackLink href={`${linkRoutes.renter}/${token}`}>{t('toRental')}</BackLink>
    </RenterPage>
  )
}
