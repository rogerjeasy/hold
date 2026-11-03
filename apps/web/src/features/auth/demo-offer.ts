import 'server-only'
import { getServices } from '@/server/services'
import { readDemoSession } from './session-cookies'

// What the sign-in page offers a judge where demo mode is on: `current` while the demo this browser kept is in its
// week, so they come back to it, and `new` otherwise, including once it was retired (architecture.md section 20.3).
export async function demoOffer(): Promise<'new' | 'current' | undefined> {
  const { demoSessions } = await getServices()
  if (demoSessions === undefined) return undefined
  const kept = await readDemoSession()
  return kept !== undefined && (await demoSessions.live(kept.shopId)) ? 'current' : 'new'
}
