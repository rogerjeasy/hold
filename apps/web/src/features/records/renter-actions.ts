'use server'
import { reserveEvidencePack } from '@hold/db'
import { z } from 'zod'
import { Refusal } from '@/server/action'
import { recordDownload, renterCanReadRecord } from '@/server/record-download'
import { renterAction, withToken } from '@/server/renter-access'

export const buildRenterRecord = renterAction({ name: 'renter.evidence_requested', scope: 'view', input: withToken({}) }, async (link, _input, inLinkShop) => {
  const pack = await inLinkShop((transaction) => reserveEvidencePack(transaction, link.rentalId, new Date()))
  return pack === undefined || !renterCanReadRecord(pack.snapshot) ? new Refusal('not_found') : { packId: pack.id }
})
export const downloadRenterRecord = renterAction({ name: 'renter.evidence_downloaded', scope: 'view', input: withToken({ packId: z.uuid(), kind: z.enum(['pdf', 'manifest']) }) }, (link, input, inLinkShop) => inLinkShop((transaction) => recordDownload(transaction, link.rentalId, input.packId, input.kind, true)))
