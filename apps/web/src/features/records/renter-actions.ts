'use server'
import { reserveEvidencePack } from '@hold/db'
import { readLocale } from '@/features/auth/locale-input'
import { Refusal } from '@/server/action'
import { signEvidenceCheck } from '@/server/evidence-check'
import { recordDownload, renterCanReadRecord } from '@/server/record-download'
import { renterAction, renterInput } from '@/server/renter-access'

export const buildRenterRecord = renterAction({ name: 'renter.evidence_requested', scope: 'view', input: renterInput('build-renter-record') }, async (link, _input, inLinkShop) => {
  const pack = await inLinkShop((transaction) => reserveEvidencePack(transaction, link.rentalId, new Date()))
  return pack === undefined || !renterCanReadRecord(pack.snapshot) ? new Refusal('not_found') : { packId: pack.id }
})
export const downloadRenterRecord = renterAction({ name: 'renter.evidence_downloaded', scope: 'view', input: renterInput('download-renter-record') }, (link, input, inLinkShop) => inLinkShop((transaction) => recordDownload(transaction, link.rentalId, input.packId, input.kind, true)))
// Signs what Hold holds about one item's sealed evidence, for the renter or a tribunal to check on /verify.
export const checkEvidence = renterAction({ name: 'renter.evidence_checked', scope: 'view', input: renterInput('check-evidence') }, (link, input, inLinkShop) => signEvidenceCheck(link, inLinkShop, input.itemId, readLocale(input.locale)))
