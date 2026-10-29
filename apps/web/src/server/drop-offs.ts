import 'server-only'
import type { WaitingDropOff } from '@hold/db'
import type { DropOffEntry } from '@/features/self-return/drop-off-card'
import { getServices } from './services'

// Items renters dropped off, with their photographs as short-lived signed links to the display copies.
export async function dropOffEntries(waiting: readonly WaitingDropOff[]): Promise<DropOffEntry[]> {
  const { evidence } = await getServices()
  const shown = async (photo: { readonly view: string; readonly displayKey: string | null } | null) =>
    photo === null ? null : { view: photo.view, url: photo.displayKey === null || evidence === undefined ? null : await evidence.displayLink(photo.displayKey) }
  return Promise.all(waiting.map(async (entry) => ({
    ...entry,
    items: await Promise.all(entry.items.map(async (item) => ({ ...item, before: await shown(item.before), after: await shown(item.after), dropPoint: await shown(item.dropPoint) }))),
  })))
}
