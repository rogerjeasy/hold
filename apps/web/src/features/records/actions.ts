'use server'
import { reserveEvidencePack } from '@hold/db'
import { z } from 'zod'
import { recordDownload } from '@/server/record-download'
import { getServices } from '@/server/services'
import { Refusal, shopAction, withLocale } from '@/server/shop-access'

export const buildRecord = shopAction({ name: 'evidence.requested', roles: ['owner', 'manager', 'counter_staff'], needsPasskey: false, input: withLocale({ rentalId: z.uuid() }) }, async (_context, input, transaction) => {
  const pack = await reserveEvidencePack(transaction, input.rentalId, new Date())
  return pack === undefined ? new Refusal('not_found') : { packId: pack.id, rentalId: pack.rentalId }
}, async (context, output) => {
  const { settle } = await getServices()
  await settle.send({ queue: 'evidence', group: output.rentalId, deduplicationId: output.packId, body: { shopId: context.shop.id, packId: output.packId } })
})
export const downloadRecord = shopAction({ name: 'evidence.downloaded', roles: ['owner', 'manager', 'counter_staff', 'read_only'], needsPasskey: false, input: withLocale({ rentalId: z.uuid(), packId: z.uuid(), kind: z.enum(['pdf', 'manifest']) }) }, (_context, input, transaction) => recordDownload(transaction, input.rentalId, input.packId, input.kind, false))
