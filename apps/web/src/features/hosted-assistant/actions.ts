'use server'

import { conversationSchema, followOwnBooking } from '@hold/mcp'
import type { HostedLookup } from '@hold/mcp'
import { z } from 'zod'
import { askHostedAssistant, HOSTED_CLIENT_NAME, notLookedUp } from '@/server/hosted-assistant'
import { mcpPorts } from '@/server/mcp-ports'
import { publicAction } from '@/server/public-action'
import { demoShop } from './demo-shop'
import type { DemoShop } from './demo-shop'
import { HOSTED_QUESTION_LIMITS } from './limits'

// The hosted assistant's page (extensions.md section 8.10). Built by publicAction, which limits each network and checks
// the input. The conversation is the page's own record of the chat; every tool call in it still passes Hold's gateway.

const conversation = z
  .string()
  .max(200_000)
  .transform((value, context) => {
    try {
      return JSON.parse(value) as unknown
    } catch {
      context.addIssue({ code: 'custom', message: 'The conversation is not JSON.' })
      return z.NEVER
    }
  })
  .pipe(conversationSchema)

// "Ask about my latest booking": the demo shop's own latest booking, bound to a booking secret for this conversation
// and read through get_booking, as any assistant reads a booking it made.
async function latestBooking(shop: DemoShop | undefined): Promise<{ readonly ok: true; readonly lookup: HostedLookup } | { readonly ok: false; readonly reason: 'no_booking' | 'already_followed' }> {
  if (shop === undefined) return { ok: false, reason: 'no_booking' }
  const followed = await followOwnBooking(await mcpPorts(), shop.shopId, HOSTED_CLIENT_NAME)
  return followed.ok ? { ok: true, lookup: { name: 'get_booking', input: { booking_secret: followed.bookingSecret } } } : followed
}

export const askAssistant = publicAction(
  { name: 'hosted-assistant.asked', limit: HOSTED_QUESTION_LIMITS.perNetwork, dailyCap: HOSTED_QUESTION_LIMITS.perDay, input: z.strictObject({ conversation, text: z.string().trim().min(1).max(1000), locale: z.string().max(5), lookup: z.literal('latest_booking').optional() }) },
  async (input) => {
    const shop = await demoShop()
    const ownShop = shop === undefined ? undefined : { slug: shop.slug, name: shop.name }
    if (input.lookup === undefined) return askHostedAssistant(input.conversation, input.text, ownShop)
    const found = await latestBooking(shop)
    return found.ok ? askHostedAssistant(input.conversation, input.text, ownShop, found.lookup) : notLookedUp(input.conversation, found.reason)
  },
)
