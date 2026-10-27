import 'server-only'
import { createHmac, randomInt } from 'node:crypto'
import { getServices, TEST_SIGN_IN_CODE } from './services'

// The one-time code a renter types for a money decision (architecture.md section 12.3). Its digest names what it is
// for, so a code sent to accept a claim can never agree an incident's price, nor one incident's another's.

// What a code is for. The code a renter types to reply to a claim also hands the contest to an advocate; confirming an
// agreement the advocates reached needs a code of its own.
export const CODE_PURPOSES = { claimReply: 'claim-reply', settlement: 'settlement-confirm' } as const

export async function newRenterCode(): Promise<string> {
  const services = await getServices()
  return services.config.services === 'fake' ? TEST_SIGN_IN_CODE : String(randomInt(0, 100000000)).padStart(8, '0')
}

export async function renterCodeDigest(purpose: string, linkId: string, code: string): Promise<string> {
  return createHmac('sha256', (await getServices()).renterLinkKey).update(`${purpose}:${linkId}:${code}`).digest('hex')
}
