'use server'

import { addPoliceReport, agreeIncident, auditLog, issueIncidentCode, leaveIncidentForReturn, saveTheftDetails, useClaimCode } from '@hold/db'
import { INCIDENT_HINTS, INCIDENT_LIMITS } from '@hold/domain'
import { MAX_PHOTO_BYTES } from '@hold/evidence'
import { z } from 'zod'
import { readLocale } from '@/features/auth/locale-input'
import { Refusal } from '@/server/action'
import { confirmIncidentPhoto, requestIncidentPhoto, sendReport, startReport } from '@/server/incident-report'
import { renterAction, withToken } from '@/server/renter-access'
import { codeVia, newRenterCode, renterCodeDigest } from '@/server/renter-code'
import { copyDecisionToEmail } from '@/server/decision-copy'
import { deliverRenterCode } from '@/server/renter-code-delivery'

// What a renter does through their link when something happens during the rental (extensions.md section 10). Each is
// built by renterAction, which checks the link, its report_incident scope and the network's rate first. No amount comes
// from the renter: an agreed price is the entry a staff member confirmed, read from the database.

const incident = { incidentId: z.uuid() }
const fraction = z.coerce.number().min(0).max(1)
const theftField = z.string().trim().max(300)

export const reportIncident = renterAction(
  { name: 'renter.incident_started', scope: 'report_incident', input: withToken({ itemId: z.uuid(), hint: z.enum(INCIDENT_HINTS), description: z.string().trim().min(1).max(INCIDENT_LIMITS.descriptionLength) }) },
  (link, input, inLinkShop) => startReport(link, inLinkShop, { itemId: input.itemId, hint: input.hint, description: input.description, language: readLocale(input.locale) }),
)

const view = { ...incident, view: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/) }

export const requestIncidentUpload = renterAction(
  { name: 'renter.incident_upload_requested', scope: 'report_incident', input: withToken({ ...view, sha256: z.string().regex(/^[0-9a-f]{64}$/), bytes: z.coerce.number().int().min(1).max(MAX_PHOTO_BYTES) }) },
  (link, input, inLinkShop) => requestIncidentPhoto(link, inLinkShop, input),
)

export const confirmIncidentUpload = renterAction(
  {
    name: 'renter.incident_photo_recorded',
    scope: 'report_incident',
    input: withToken({ ...view, key: z.string().min(1).max(300), sharpness: z.coerce.number().min(0).max(1_000_000), shadows: z.coerce.number().min(0).max(255), highlights: z.coerce.number().min(0).max(255), filled: fraction }),
  },
  (link, input, inLinkShop) => confirmIncidentPhoto(link, inLinkShop, { incidentId: input.incidentId, view: input.view, key: input.key, measures: { sharpness: input.sharpness, shadows: input.shadows, highlights: input.highlights, filled: input.filled } }),
)

// The box is optional: a theft has nothing to box. When given, all of it is given.
export const sendIncidentReport = renterAction(
  { name: 'renter.incident_sent', scope: 'report_incident', input: withToken({ ...incident, view: z.string().max(80).optional(), x: fraction.optional(), y: fraction.optional(), width: fraction.optional(), height: fraction.optional() }) },
  (link, input, inLinkShop) => {
    const { view: boxed, x, y, width, height } = input
    const box = boxed === undefined || boxed === '' || x === undefined || y === undefined || width === undefined || height === undefined ? null : { view: boxed, region: { x, y, width, height } }
    return sendReport(link, inLinkShop, input.incidentId, box)
  },
)

const purpose = (incidentId: string) => `incident-agree:${incidentId}`

export const sendIncidentCode = renterAction({ name: 'renter.incident_code_requested', scope: 'report_incident', input: withToken({ ...incident, via: codeVia }) }, async (link, input, inLinkShop) => {
  const code = await newRenterCode()
  const hash = await renterCodeDigest(purpose(input.incidentId), link.id, code)
  const issued = await inLinkShop((transaction) => issueIncidentCode(transaction, link.id, input.incidentId, hash, new Date(), input.via))
  if (!issued.ok) return new Refusal(issued.reason)
  const delivered = await deliverRenterCode(inLinkShop, link, issued, { locale: readLocale(input.locale), code, kind: 'incident', emailWords: 'emails.incidentCode' })
  if (delivered instanceof Refusal) return delivered
  // Simulated things say so, in the record too: the address itself stays out of it.
  if (delivered.sandboxContact) await inLinkShop((transaction) => transaction.insert(auditLog).values({ shopId: link.shopId, actorKind: 'renter', actorId: link.id, action: 'renter.incident_code_sandbox_contact', subjectKind: 'incident', subjectId: input.incidentId, detail: { sandbox: true } }))
  return delivered
})

// The code and the agreement in one transaction: a wrong code agrees nothing. Nothing is charged.
export const agreeIncidentPrice = renterAction({ name: 'renter.incident_agreed', scope: 'report_incident', input: withToken({ ...incident, code: z.string().regex(/^[0-9]{8}$/) }) }, async (link, input, inLinkShop) => {
  const hash = await renterCodeDigest(purpose(input.incidentId), link.id, input.code)
  const result = await inLinkShop(async (transaction) => {
    const verified = await useClaimCode(transaction, link.id, hash, new Date())
    if (!verified.ok) return verified
    return agreeIncident(transaction, link.rentalId, input.incidentId, new Date())
  })
  if (!result.ok) return new Refusal(result.reason)
  await copyDecisionToEmail(inLinkShop, link, 'incident_agreed', readLocale(input.locale))
  return {}
})

export const leaveIncidentToReturn = renterAction({ name: 'renter.incident_left_for_return', scope: 'report_incident', input: withToken(incident) }, async (link, input, inLinkShop) => {
  const result = await inLinkShop((transaction) => leaveIncidentForReturn(transaction, link.rentalId, input.incidentId))
  return result.ok ? {} : new Refusal(result.reason)
})

export const giveTheftDetails = renterAction(
  { name: 'renter.incident_theft_details', scope: 'report_incident', input: withToken({ ...incident, where: theftField.min(1), when: theftField.min(1), lockAndKeys: theftField.min(1), policeReport: theftField.optional() }) },
  async (link, input, inLinkShop) => {
    const result = await inLinkShop((transaction) => saveTheftDetails(transaction, link.rentalId, input.incidentId, { where: input.where, when: input.when, lockAndKeys: input.lockAndKeys, policeReport: input.policeReport ?? '' }))
    return result.ok ? {} : new Refusal(result.reason)
  },
)

export const givePoliceReport = renterAction({ name: 'renter.incident_police_report', scope: 'report_incident', input: withToken({ ...incident, policeReport: theftField.min(1) }) }, async (link, input, inLinkShop) => {
  const result = await inLinkShop((transaction) => addPoliceReport(transaction, link.rentalId, input.incidentId, input.policeReport))
  return result.ok ? {} : new Refusal(result.reason)
})
