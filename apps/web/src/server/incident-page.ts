import 'server-only'
import { captureSession, incidentForRenter, inShop, rentalHandovers, rentalIncidents, renterView, returnBaseline } from '@hold/db'
import type { RenterIncident } from '@hold/db'
import type { EarlierReport } from '@/features/incidents/renter-incidents-screen'
import type { IncidentCaptureData } from '@/features/incidents/renter-incident-screen'
import type { ReportableItem } from '@/features/incidents/incident-start-form'
import { renterAccess } from './renter-access'
import { getServices } from './services'

// What "Something happened" reads through a renter's link. Only a link that may report opens it; photographs are
// shown through short-lived signed links to their display copies.

type Refused = { readonly ok: false; readonly failure: 'link_invalid' | 'scope' | 'rate_limited' }
const OPEN_RENTAL = ['out', 'overdue']

export type IncidentsPage = { readonly ok: true; readonly shopName: string; readonly open: boolean; readonly items: readonly ReportableItem[]; readonly earlier: readonly EarlierReport[] } | Refused

export async function incidentsPage(token: string): Promise<IncidentsPage> {
  const now = new Date()
  const access = await renterAccess(token, 'report_incident', now)
  if (!access.ok) return access
  const { database } = await getServices()
  const { rentalId, shopId } = access.link
  const loaded = await inShop(database, { role: 'hold_app', shopId }, async (transaction) => ({ view: await renterView(transaction, rentalId, now), handovers: await rentalHandovers(transaction, rentalId), earlier: await rentalIncidents(transaction, rentalId) }))
  if (loaded.view === undefined) return { ok: false, failure: 'link_invalid' }
  return {
    ok: true,
    shopName: loaded.view.shopName,
    open: OPEN_RENTAL.includes(loaded.view.state),
    items: loaded.handovers.filter((item) => item.sealed).map((item) => ({ itemId: item.itemId, label: item.label })),
    earlier: loaded.earlier.map((report) => ({ ...report, reportedAt: report.reportedAt.toISOString() })),
  }
}

export type IncidentPage = { readonly ok: true; readonly shopName: string; readonly incident: RenterIncident; readonly capture: IncidentCaptureData } | Refused

export async function incidentPage(token: string, incidentId: string): Promise<IncidentPage> {
  const now = new Date()
  const access = await renterAccess(token, 'report_incident', now)
  if (!access.ok) return access
  const { database, evidence } = await getServices()
  const { rentalId, shopId } = access.link
  const loaded = await inShop(database, { role: 'hold_app', shopId }, async (transaction) => {
    const incident = await incidentForRenter(transaction, rentalId, incidentId)
    if (incident === undefined) return undefined
    return { incident, view: await renterView(transaction, rentalId, now), session: await captureSession(transaction, incident.sessionId), baseline: await returnBaseline(transaction, incident.sessionId) }
  })
  if (loaded?.view === undefined || loaded.session === undefined) return { ok: false, failure: 'link_invalid' }
  const link = async (key: string | null) => (key === null || evidence === undefined ? null : evidence.displayLink(key))
  const guides = Object.fromEntries((await Promise.all(loaded.baseline.map(async (photo) => [photo.view, await link(photo.displayKey)] as const))).filter((entry): entry is readonly [string, string] => entry[1] !== null))
  return {
    ok: true,
    shopName: loaded.view.shopName,
    incident: loaded.incident,
    capture: {
      views: loaded.session.plan.map((view) => ({ key: view.key, label: view.label, outline: view.outline })),
      photos: await Promise.all(loaded.session.photos.map(async (photo) => ({ view: photo.view, url: await link(photo.displayKey), simulated: photo.simulated === true }))),
      guides,
    },
  }
}
