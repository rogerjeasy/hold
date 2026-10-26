import type { IncidentKind, IncidentState } from '@hold/domain'
import { ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { Link } from '@/i18n/navigation'
import { linkRoutes } from '@/lib/routes'
import { IncidentStartForm } from './incident-start-form'
import type { ReportableItem } from './incident-start-form'

export type EarlierReport = { readonly id: string; readonly state: IncidentState; readonly kind: IncidentKind | null; readonly itemLabel: string; readonly reportedAt: string }

// "Something happened": a new report while the renter has the items, and the reports they made before.
export function RenterIncidentsScreen({ token, shopName, open, items, earlier }: { token: string; shopName: string; open: boolean; items: readonly ReportableItem[]; earlier: readonly EarlierReport[] }) {
  const t = useTranslations('renter.incident')
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8 md:px-8 md:py-12">
      <header className="grid gap-3">
        <p className="label text-xs text-muted-foreground wrap-long-words">{shopName}</p>
        <h1 className="text-page-title text-balance">{t('title')}</h1>
        <p className="text-lead text-muted-foreground">{t('lead')}</p>
        <Link href={`${linkRoutes.renter}/${token}`} referrerPolicy="no-referrer" className="inline-flex min-h-11 items-center gap-2 justify-self-start font-semibold underline underline-offset-4"><ArrowLeft aria-hidden="true" className="size-4" />{t('toRental')}</Link>
      </header>
      <p className="border-2 border-destructive p-4 font-semibold">{t('emergencyFirst')}</p>
      {open ? <Panel title={t('newReport')}><div className="p-4 md:p-5"><IncidentStartForm token={token} items={items} /></div></Panel> : <p>{t('closed')}</p>}
      {earlier.length === 0 ? null : (
        <Panel title={t('earlier')}>
          <ul>
            {earlier.map((report) => (
              <li key={report.id} className="border-b last:border-b-0">
                <Link href={linkRoutes.incident(token, report.id)} referrerPolicy="no-referrer" className="grid min-h-11 gap-0.5 px-4 py-3 hover:bg-accent md:px-5">
                  <span className="font-semibold wrap-long-words">{report.itemLabel}</span>
                  <span className="text-sm text-muted-foreground">{t(`states.${report.state}`)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}
