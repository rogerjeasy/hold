'use server'

import { demoSessionLive, inShop, shopSettings } from '@hold/db'
import { conversationSchema } from '@hold/mcp'
import type { OwnShop } from '@hold/mcp'
import { z } from 'zod'
import { readDemoSession } from '@/features/auth/session-cookies'
import { askHostedAssistant } from '@/server/hosted-assistant'
import { publicAction } from '@/server/public-action'
import { getServices } from '@/server/services'
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

// The demo shop this browser started, proved by its sealed cookie, while it is in its week. No assistant can find it
// otherwise.
async function demoShop(): Promise<OwnShop | undefined> {
  const session = await readDemoSession()
  if (session === undefined) return undefined
  const { database } = await getServices()
  if (!(await demoSessionLive(database, session.shopId))) return undefined
  const settings = await inShop(database, { role: 'hold_app', shopId: session.shopId }, (transaction) => shopSettings(transaction, session.shopId))
  return settings === undefined ? undefined : { slug: settings.slug, name: settings.name }
}

export const askAssistant = publicAction(
  { name: 'hosted-assistant.asked', limit: HOSTED_QUESTION_LIMITS.perNetwork, dailyCap: HOSTED_QUESTION_LIMITS.perDay, input: z.strictObject({ conversation, text: z.string().trim().min(1).max(1000), locale: z.string().max(5) }) },
  async (input) => askHostedAssistant(input.conversation, input.text, await demoShop()),
)
