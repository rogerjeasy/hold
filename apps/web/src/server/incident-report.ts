import 'server-only'
import { randomUUID } from 'node:crypto'
import { triageIncident } from '@hold/compare'
import { incidentAlert, incidentForRenter, inShop, markIncidentAlerted, recordPhoto, sendIncident, sortIncidentReport, startIncident } from '@hold/db'
import type { MarkedBox, NewIncident, RenterLink } from '@hold/db'
import type { DeclaredPhotoSource, PhotoMeasures } from '@hold/domain'
import { incidentAlertEmail } from '@hold/notify'
import { shopRoutes } from '@/lib/routes'
import { Refusal } from './action'
import { sendMediaMessage } from './media'
import { pushToStaff } from './push'
import type { InLinkShop } from './renter-access'
import { getServices } from './services'

// A renter's report during a rental (extensions.md section 10): the words are stored first, then the photographs, then
// the report is sent, sorted and staff are told. Nothing here calls PayPal or charges anything.

export async function startReport(link: RenterLink, inLinkShop: InLinkShop, report: Omit<NewIncident, 'rentalId'>) {
  const started = await inLinkShop((transaction) => startIncident(transaction, { ...report, rentalId: link.rentalId }, new Date()))
  return started.ok ? { incidentId: started.incidentId } : new Refusal(started.reason)
}

async function openSession(link: RenterLink, inLinkShop: InLinkShop, incidentId: string): Promise<string | Refusal> {
  const incident = await inLinkShop((transaction) => incidentForRenter(transaction, link.rentalId, incidentId))
  if (incident === undefined) return new Refusal('not_found')
  return incident.state === 'reported' ? incident.sessionId : new Refusal('already_sent')
}

export async function requestIncidentPhoto(link: RenterLink, inLinkShop: InLinkShop, input: { readonly incidentId: string; readonly view: string; readonly sha256: string; readonly bytes: number }) {
  const { evidence } = await getServices()
  if (evidence === undefined) return new Refusal('storage_unavailable')
  const sessionId = await openSession(link, inLinkShop, input.incidentId)
  if (sessionId instanceof Refusal) return sessionId
  const key = `${link.shopId}/${sessionId}/${input.view}/${randomUUID()}.jpg`
  const upload = await evidence.uploadLink({ key, sha256: input.sha256, bytes: input.bytes })
  return { key, url: upload.url, headers: upload.headers }
}

// Records the photograph that reached the locked bucket, with the fingerprint the store computed and the server's time.
export async function confirmIncidentPhoto(link: RenterLink, inLinkShop: InLinkShop, input: { readonly incidentId: string; readonly view: string; readonly key: string; readonly measures: PhotoMeasures; readonly source?: DeclaredPhotoSource | undefined }) {
  const { evidence } = await getServices()
  if (evidence === undefined) return new Refusal('storage_unavailable')
  const sessionId = await openSession(link, inLinkShop, input.incidentId)
  if (sessionId instanceof Refusal) return sessionId
  if (!input.key.startsWith(`${link.shopId}/${sessionId}/${input.view}/`)) return new Refusal('key_mismatch')
  const stored = await evidence.stored(input.key)
  if (stored === undefined) return new Refusal('not_uploaded')
  const recorded = await inLinkShop((transaction) => recordPhoto(transaction, sessionId, { view: input.view, evidenceKey: input.key, sha256: stored.sha256, source: input.source, quality: input.measures }, new Date()))
  if (!recorded.ok) return new Refusal(recorded.reason)
  try {
    await sendMediaMessage(link.shopId, sessionId, recorded.photoId)
  } catch {
    // Its outbox row hands it to the worker later.
  }
  return { photoId: recorded.photoId }
}

// Sends the report: sealed and stored first, then sorted by one bounded model call outside any transaction, then staff
// are told. If the model or the sorting fails, the report is already stored and staff are told all the same (X5.8).
export async function sendReport(link: RenterLink, inLinkShop: InLinkShop, incidentId: string, box: MarkedBox | null) {
  const sent = await inLinkShop((transaction) => sendIncident(transaction, link.rentalId, incidentId, box, new Date()))
  if (!sent.ok) return new Refusal(sent.reason)
  try {
    const answer = await triageIncident({ hint: sent.hint, description: sent.description, itemType: sent.itemType, language: sent.language, prices: sent.prices }, (await getServices()).incidentModel)
    const sorted = await inLinkShop((transaction) => sortIncidentReport(transaction, incidentId, answer, new Date()))
    return sorted.ok ? { state: sorted.state } : new Refusal(sorted.reason)
  } finally {
    await alertStaff(link.shopId, incidentId)
  }
}

// Tells the shop's owners and managers at once, each in their language. Recorded once any of them was sent it; the
// incidents page lists the report whether or not an email went out.
export async function alertStaff(shopId: string, incidentId: string): Promise<void> {
  try {
    const { database, mailer, config } = await getServices()
    const scope = { role: 'hold_app', shopId } as const
    const alert = await inShop(database, scope, (transaction) => incidentAlert(transaction, incidentId))
    if (alert === undefined) return
    const facts = { shopName: alert.shopName, itemLabel: alert.itemLabel, kind: alert.kind, incidentsUrl: `${config.publicUrl}${shopRoutes.incidents}` }
    const sent = await Promise.all(alert.recipients.map((recipient) => mailer.send(incidentAlertEmail(recipient.email, recipient.language, facts))))
    if (sent.some(Boolean)) await inShop(database, scope, (transaction) => markIncidentAlerted(transaction, incidentId, new Date()))
    await pushToStaff(shopId, 'decision_waiting', { to: 'rental', id: alert.rentalId })
  } catch {
    // The report is stored and listed for staff; a failed email is visible there as not sent.
  }
}
