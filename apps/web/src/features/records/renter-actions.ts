'use server'
import { reserveEvidencePack } from '@hold/db'
import { Refusal } from '@/server/action'
import { recordDownload, renterCanReadRecord } from '@/server/record-download'
import { renterAction, renterInput } from '@/server/renter-access'

export const buildRenterRecord = renterAction({ name: 'renter.evidence_requested', scope: 'view', input: renterInput('build-renter-record') }, async (link, _input, inLinkShop) => {
  const pack = await inLinkShop((transaction) => reserveEvidencePack(transaction, link.rentalId, new Date()))
  return pack === undefined || !renterCanReadRecord(pack.snapshot) ? new Refusal('not_found') : { packId: pack.id }
})
export const downloadRenterRecord = renterAction({ name: 'renter.evidence_downloaded', scope: 'view', input: renterInput('download-renter-record') }, (link, input, inLinkShop) => inLinkShop((transaction) => recordDownload(transaction, link.rentalId, input.packId, input.kind, true)))
