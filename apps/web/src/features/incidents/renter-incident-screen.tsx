'use client'

import type { RenterIncident } from '@hold/db'
import { useTranslations } from 'next-intl'
import { useLookAgain } from '@/hooks/use-look-again'
import { BackLink, RenterHead, RenterPage } from '@/features/renter/renter-page'
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
    <RenterPage className="max-w-3xl">
      <RenterHead shopName={shopName} title={t('reportTitle', { item: incident.itemLabel })} />
      <section aria-label={t('yourWords')} className="surface grid min-w-0 animate-rise gap-2 p-5 md:p-6">
        <h2 className="label text-xs text-muted-foreground">{t('yourWords')}</h2>
        <blockquote className="min-w-0 border-l-2 border-primary/60 pl-3.5 text-lg whitespace-pre-wrap text-pretty wrap-long-words">{incident.description}</blockquote>
      </section>
      {writing ? <IncidentCapture token={token} incidentId={incident.id} {...capture} /> : <IncidentOutcomePanel token={token} incident={incident} />}
      <BackLink href={linkRoutes.incidents(token)}>{t('back')}</BackLink>
    </RenterPage>
  )
}
