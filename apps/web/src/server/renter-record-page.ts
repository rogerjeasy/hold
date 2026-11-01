import 'server-only'
import { evidenceVersions, inShop, receiptDeliveriesFor, renterView } from '@hold/db'
import type { EvidenceVersion, ReceiptDeliverySummary } from '@hold/db'
import { z } from 'zod'
import { renterAccess } from './renter-access'
import { getServices } from './services'

export type RenterRecordPage = { readonly ok: true; readonly rentalId: string; readonly shopName: string; readonly versions: readonly EvidenceVersion[]; readonly receipts: readonly ReceiptDeliverySummary[] } | { readonly ok: false; readonly failure: 'link_invalid' | 'scope' | 'rate_limited' | 'not_found' }

// The rental's record through a renter's link: the versions a renter may read, or one of them, and the receipts sent
// with them. A version that is not this rental's, or not yet shared, is not found. The link is checked before the
// query is read (AGENTS.md section 7), so a guessed token costs its network a try whatever the query says.
const recordQuery = z.strictObject({ version: z.uuid().optional() })

export async function renterRecordPage(token: string, query: unknown): Promise<RenterRecordPage> {
  const now = new Date()
  const access = await renterAccess(token, 'view', now)
  if (!access.ok) return access
  const selected = recordQuery.safeParse(query)
  if (!selected.success) return { ok: false, failure: 'link_invalid' }
  const { version } = selected.data
  const { database } = await getServices()
  const { rentalId, shopId } = access.link
  const loaded = await inShop(database, { role: 'hold_app', shopId }, async (transaction) => ({ view: await renterView(transaction, rentalId, now), versions: await evidenceVersions(transaction, rentalId, true), receipts: await receiptDeliveriesFor(transaction, rentalId) }))
  if (loaded.view === undefined) return { ok: false, failure: 'link_invalid' }
  const versions = version === undefined ? loaded.versions : loaded.versions.filter((each) => each.id === version)
  if (version !== undefined && versions.length === 0) return { ok: false, failure: 'not_found' }
  const receipts = loaded.receipts.filter((receipt) => versions.some((each) => each.id === receipt.packId))
  return { ok: true, rentalId, shopName: loaded.view.shopName, versions, receipts }
}
