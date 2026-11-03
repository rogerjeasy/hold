import 'server-only'
import { captureSession, rentalHandovers, rentalReturns } from '@hold/db'
import type { Transaction } from '@hold/db'

export type ItemPhotoKeys = { readonly itemId: string; readonly label: string; readonly views: readonly { readonly view: string; readonly label: string; readonly beforeKey: string | null; readonly afterKey: string | null }[] }

// Each item's sealed handover and return photographs, view by view in the item's own order, for the renter's claim
// page: a line a person added by hand has no photographs of its own. Only sealed sessions are read; nothing changes.
export async function sealedItemPhotos(transaction: Transaction, rentalId: string): Promise<readonly ItemPhotoKeys[]> {
  const handovers = await rentalHandovers(transaction, rentalId)
  const returns = await rentalReturns(transaction, rentalId)
  const items = []
  for (const handover of handovers) {
    const back = returns.find((each) => each.itemId === handover.itemId)
    if (handover.sessionId === null || !handover.sealed || back?.sessionId == null || !back.sealed) continue
    const before = await captureSession(transaction, handover.sessionId)
    const after = await captureSession(transaction, back.sessionId)
    if (before === undefined || after === undefined) continue
    const keyOf = (session: typeof before, view: string) => session.photos.find((photo) => photo.view === view)?.displayKey ?? null
    const views = before.plan.map((step) => ({ view: step.key, label: step.label, beforeKey: keyOf(before, step.key), afterKey: keyOf(after, step.key) })).filter((view) => view.beforeKey !== null || view.afterKey !== null)
    if (views.length > 0) items.push({ itemId: handover.itemId, label: handover.label, views })
  }
  return items
}
