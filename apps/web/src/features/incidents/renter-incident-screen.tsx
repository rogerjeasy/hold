'use client'

import type { RenterIncident } from '@hold/db'
import { ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useLookAgain } from '@/hooks/use-look-again'
import { Link } from '@/i18n/navigation'
import { linkRoutes } from '@/lib/routes'
import { IncidentCapture } from './incident-capture'
import type { CapturePhoto, CaptureView } from './incident-capture'
import { IncidentOutcomePanel } from './incident-outcome-panel'

export type IncidentCaptureData = { readonly views: readonly CaptureView[]; readonly photos: readonly CapturePhoto[]; readonly guides: Readonly<Record<string, string>> }

// One report during the rental: the renter's words, then the photographs while it is being written, then what the
// sorting found and the next step.
export function RenterIncidentScreen({ token, shopName, incident, capture }: { token: string; shopName: string; incident: RenterIncident; capture: IncidentCaptureData }) {
  const t = useTranslations('renter.incident')
  const writing = incident.sentAt === null
  // Photographs still being prepared, or a price a staff member has not yet confirmed: the page looks again by itself.
  useLookAgain((writing && capture.photos.some((photo) => photo.url === null)) || (!writing && (incident.state === 'reported' || (incident.state === 'triaged' && incident.offer === null))), { everyMs: 5000, forMs: 600000 })
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8 md:px-8 md:py-12">
      <header className="grid gap-3">
        <p className="label text-xs text-muted-foreground wrap-long-words">{shopName}</p>
        <h1 className="text-page-title text-balance wrap-long-words">{t('reportTitle', { item: incident.itemLabel })}</h1>
        <Link href={linkRoutes.incidents(token)} referrerPolicy="no-referrer" className="inline-flex min-h-11 items-center gap-2 justify-self-start font-semibold underline underline-offset-4"><ArrowLeft aria-hidden="true" className="size-4" />{t('back')}</Link>
      </header>
      <section aria-label={t('yourWords')} className="grid gap-2">
        <h2 className="font-semibold">{t('yourWords')}</h2>
        <blockquote className="min-w-0 whitespace-pre-wrap border-l-2 pl-3 wrap-long-words">{incident.description}</blockquote>
      </section>
      {writing ? <IncidentCapture token={token} incidentId={incident.id} {...capture} /> : <IncidentOutcomePanel token={token} incident={incident} />}
    </div>
  )
}
