import 'server-only'
import { randomInt } from 'node:crypto'
import { takeRateToken } from '@hold/db'
import { callerNetwork } from '@/server/network'
import { getServices } from '@/server/services'
import type { DemoDependencies } from './demo-session'
import type { FlowDependencies, Requester } from './sign-in-flow'

// What the sign-in steps need from the running app, for the web's sign-in pages and the phone's session routes alike.

export async function flowDependencies(): Promise<FlowDependencies> {
  const { identity, database } = await getServices()
  return { identity, database, now: () => new Date(), allow: (limit, subject) => takeRateToken(database, limit, subject) }
}

export async function demoDependencies(): Promise<DemoDependencies> {
  const { identity, demoSessions } = await getServices()
  const { allow } = await flowDependencies()
  return { identity, allow, sessions: demoSessions, newCode: newDemoCode, now: () => new Date() }
}

export async function requester(): Promise<Requester> {
  return { network: await callerNetwork() }
}

// Eight letters and digits a reader cannot confuse, about 10^12 to choose from: a demo's shop address and accounts
// cannot be guessed.
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
function newDemoCode(): string {
  return Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')
}
