import 'server-only'
import { evidenceStatementSource } from '@hold/db'
import type { RenterLink } from '@hold/db'
import { issueEvidenceStatement } from '@hold/trust'
import { Refusal } from './action'
import type { InLinkShop } from './renter-access'
import { getServices } from './services'
import { verifyUrl } from './verify-url'

// "Check this evidence" under a renter's photographs (architecture.md section 9.7): Hold signs what it holds about the
// item's sealed sessions in this rental, and the browser checks it on /verify with the published key alone.
export async function signEvidenceCheck(link: RenterLink, inLinkShop: InLinkShop, itemId: string, locale: string): Promise<{ readonly url: string } | Refusal> {
  const source = await inLinkShop((transaction) => evidenceStatementSource(transaction, link.rentalId, itemId))
  if (source === undefined) return new Refusal('not_found')
  const { trust, config } = await getServices()
  try {
    return { url: verifyUrl(config.publicUrl, locale, await issueEvidenceStatement(await trust.signer(), source, new Date())) }
  } catch {
    // The signing key could not be reached. Nothing changed; the renter is told to try again.
    return new Refusal('signing_unavailable')
  }
}
