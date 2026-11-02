'use server'

import { addPoliceReport, agreeIncident, auditLog, issueIncidentCode, leaveIncidentForReturn, saveTheftDetails, useClaimCode } from '@hold/db'
import { readLocale } from '@/features/auth/locale-input'
import { Refusal } from '@/server/action'
import { confirmIncidentPhoto, requestIncidentPhoto, sendReport, startReport } from '@/server/incident-report'
import { renterAction, renterInput } from '@/server/renter-access'
import { newRenterCode, renterCodeDigest } from '@/server/renter-code'
import { copyDecisionToEmail } from '@/server/decision-copy'
import { deliverRenterCode } from '@/server/renter-code-delivery'

// What a renter does through their link when something happens during the rental (extensions.md section 10). Each is
// built by renterAction, which checks the link, its report_incident scope and the network's rate first. No amount comes
// from the renter: an agreed price is the entry a staff member confirmed, read from the database.

export const reportIncident = renterAction(
  { name: 'renter.incident_started', scope: 'report_incident', input: renterInput('report-incident') },
  (link, input, inLinkShop) => startReport(link, inLinkShop, { itemId: input.itemId, hint: input.hint, description: input.description, language: readLocale(input.locale) }),
)

export const requestIncidentUpload = renterAction(
  { name: 'renter.incident_upload_requested', scope: 'report_incident', input: renterInput('request-incident-upload') },
  (link, input, inLinkShop) => requestIncidentPhoto(link, inLinkShop, input),
)

export const confirmIncidentUpload = renterAction(
  {
    name: 'renter.incident_photo_recorded',
    scope: 'report_incident',
    input: renterInput('confirm-incident-upload'),
  },
  (link, input, inLinkShop) => confirmIncidentPhoto(link, inLinkShop, { incidentId: input.incidentId, view: input.view, key: input.key, measures: { sharpness: input.sharpness, shadows: input.shadows, highlights: input.highlights, filled: input.filled }, source: input.source }),
)

// The box is optional: a theft has nothing to box. When given, all of it is given.
export const sendIncidentReport = renterAction(
  { name: 'renter.incident_sent', scope: 'report_incident', input: renterInput('send-incident-report') },
  (link, input, inLinkShop) => {
    const { view: boxed, x, y, width, height } = input
    const box = boxed === undefined || boxed === '' || x === undefined || y === undefined || width === undefined || height === undefined ? null : { view: boxed, region: { x, y, width, height } }
    return sendReport(link, inLinkShop, input.incidentId, box)
  },
)

const purpose = (incidentId: string) => `incident-agree:${incidentId}`

export const sendIncidentCode = renterAction({ name: 'renter.incident_code_requested', scope: 'report_incident', input: renterInput('send-incident-code') }, async (link, input, inLinkShop) => {
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
export const agreeIncidentPrice = renterAction({ name: 'renter.incident_agreed', scope: 'report_incident', input: renterInput('agree-incident-price') }, async (link, input, inLinkShop) => {
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

export const leaveIncidentToReturn = renterAction({ name: 'renter.incident_left_for_return', scope: 'report_incident', input: renterInput('leave-incident-to-return') }, async (link, input, inLinkShop) => {
  const result = await inLinkShop((transaction) => leaveIncidentForReturn(transaction, link.rentalId, input.incidentId))
  return result.ok ? {} : new Refusal(result.reason)
})

export const giveTheftDetails = renterAction(
  { name: 'renter.incident_theft_details', scope: 'report_incident', input: renterInput('give-theft-details') },
  async (link, input, inLinkShop) => {
    const result = await inLinkShop((transaction) => saveTheftDetails(transaction, link.rentalId, input.incidentId, { where: input.where, when: input.when, lockAndKeys: input.lockAndKeys, policeReport: input.policeReport ?? '' }))
    return result.ok ? {} : new Refusal(result.reason)
  },
)

export const givePoliceReport = renterAction({ name: 'renter.incident_police_report', scope: 'report_incident', input: renterInput('give-police-report') }, async (link, input, inLinkShop) => {
  const result = await inLinkShop((transaction) => addPoliceReport(transaction, link.rentalId, input.incidentId, input.policeReport))
  return result.ok ? {} : new Refusal(result.reason)
})
