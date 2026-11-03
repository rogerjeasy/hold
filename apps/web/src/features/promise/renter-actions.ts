'use server'
import { claimMessageRecipients, takeRateToken, writeClaimMessage } from '@hold/db'
import { renterWroteEmail } from '@hold/notify'
import { rentalRoutes } from '@/lib/routes'
import { Refusal } from '@/server/action'
import { mayEmail } from '@/server/email-allowance'
import { renterAction, renterInput } from '@/server/renter-access'
import { pushToStaff } from '@/server/push'
import { getServices } from '@/server/services'

const MESSAGES = { name: 'claim-message-renter', max: 10, windowSeconds: 3600 } as const

// The renter writes to the shop from their claim page (architecture.md section 6.16). Only a claim link carries the
// contest scope. The words are stored as written; the email to staff names the renter and links to the claim, and
// never quotes them.
export const writeToShop = renterAction({ name: 'renter.claim_message_sent', scope: 'contest', input: renterInput('write-to-shop') }, async (link, input, inLinkShop) => {
  const services = await getServices()
  if (!(await takeRateToken(services.database, MESSAGES, link.id))) return new Refusal('rate_limited')
  const written = await inLinkShop((transaction) => writeClaimMessage(transaction, { rentalId: link.rentalId, author: 'renter', userId: null, body: input.body }, new Date()))
  if (!written.ok) return new Refusal(written.reason)
  try {
    const told = await inLinkShop((transaction) => claimMessageRecipients(transaction, link.rentalId))
    const claimUrl = `${services.config.publicUrl}${rentalRoutes.claim(link.rentalId)}`
    for (const recipient of told?.recipients ?? []) {
      if (!(await inLinkShop((transaction) => mayEmail(transaction, { shopId: link.shopId, rentalId: link.rentalId, to: recipient.email })))) continue
      await services.mailer.send(renterWroteEmail(recipient.email, recipient.language, { shopName: told?.shopName ?? '', renter: told?.renter ?? '—', claimUrl }))
    }
  } catch {
    // The message is stored and shown on the staff claim page whether or not an email went out.
  }
  await pushToStaff(link.shopId, 'renter_message', { to: 'rental', id: link.rentalId })
  return {}
})
