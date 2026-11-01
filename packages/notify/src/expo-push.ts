import { GetSecretValueCommand, ResourceNotFoundException, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { z } from 'zod'
import type { PushMessage, PushReceipt, PushSender, PushTicket } from './push.ts'

// Pushes through Expo's push service (tech-stack.md section 11), which hands each to Apple or Google with the keys the
// owner uploaded to EAS. Only fetch: Expo's HTTP API needs no client library. With an access token (Expo's "enhanced
// push security"), nobody but Hold can push to Hold's phones; without one, any holder of a phone's token can.

const SEND_URL = 'https://exp.host/--/api/v2/push/send'
const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'
// Expo's own limits per request.
const MESSAGES_PER_REQUEST = 100
const RECEIPTS_PER_REQUEST = 1000
const TIMEOUT_MS = 5_000

const failure = z.object({ status: z.literal('error'), message: z.string().optional(), details: z.object({ error: z.string().optional() }).optional() })
const ticketsSchema = z.object({ data: z.array(z.union([z.object({ status: z.literal('ok'), id: z.string() }), failure])) })
const receiptsSchema = z.object({ data: z.record(z.string(), z.union([z.object({ status: z.literal('ok') }), failure])) })

type Fetch = (url: string, init: RequestInit) => Promise<Response>

const chunks = <Value>(values: readonly Value[], size: number): Value[][] => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size))
const unavailable: PushTicket = { ok: false, reason: 'unavailable' }

export function createExpoPushSender(options: { readonly accessToken: () => Promise<string | undefined>; readonly fetch?: Fetch }): PushSender {
  const fetch: Fetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init))
  // A failure is logged by its kind and status only: Expo's messages quote the token.
  const post = async (url: string, body: unknown, event: string): Promise<unknown> => {
    try {
      const token = await options.accessToken()
      const response = await fetch(url, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json', ...(token === undefined ? {} : { authorization: `Bearer ${token}` }) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!response.ok) {
        console.warn(JSON.stringify({ event, status: response.status }))
        return undefined
      }
      return await response.json()
    } catch (error) {
      console.warn(JSON.stringify({ event, error: error instanceof Error ? error.name : 'unknown' }))
      return undefined
    }
  }
  return {
    async send(messages) {
      const tickets: PushTicket[] = []
      for (const batch of chunks(messages, MESSAGES_PER_REQUEST)) {
        const answer = ticketsSchema.safeParse(await post(SEND_URL, batch.map((message: PushMessage) => ({ ...message, sound: 'default', channelId: 'default', priority: 'high' })), 'push_send_failed'))
        if (!answer.success || answer.data.data.length !== batch.length) {
          tickets.push(...batch.map(() => unavailable))
          continue
        }
        tickets.push(...answer.data.data.map((ticket): PushTicket => (ticket.status === 'ok' ? { ok: true, ticket: ticket.id } : ticket.details?.error === 'DeviceNotRegistered' ? { ok: false, reason: 'device_not_registered' } : unavailable)))
      }
      return tickets
    },
    async receipts(tickets) {
      const read = new Map<string, PushReceipt>(tickets.map((ticket) => [ticket, 'unknown']))
      for (const batch of chunks(tickets, RECEIPTS_PER_REQUEST)) {
        const answer = receiptsSchema.safeParse(await post(RECEIPTS_URL, { ids: batch }, 'push_receipts_failed'))
        if (!answer.success) continue
        for (const [ticket, receipt] of Object.entries(answer.data.data)) {
          if (read.has(ticket)) read.set(ticket, receipt.status === 'ok' ? 'delivered' : receipt.details?.error === 'DeviceNotRegistered' ? 'device_not_registered' : 'unknown')
        }
      }
      return read
    },
  }
}

// The Expo access token, read once from Secrets Manager. No secret named, or none there, means pushes go without one; a
// secret that could not be read is tried again with the next push. The client is passed in only by tests.
export function expoAccessTokenFromSecret(secretId: string | undefined, region: string, client: Pick<SecretsManagerClient, 'send'> = new SecretsManagerClient({ region })): () => Promise<string | undefined> {
  let read: Promise<string | undefined> | undefined
  return () => {
    if (secretId === undefined) return Promise.resolve(undefined)
    read ??= client.send(new GetSecretValueCommand({ SecretId: secretId })).then(
      (secret) => (secret.SecretString === undefined || secret.SecretString === '' ? undefined : secret.SecretString),
      (error: unknown) => {
        if (error instanceof ResourceNotFoundException) return undefined
        read = undefined
        console.warn(JSON.stringify({ event: 'push_token_unavailable', error: error instanceof Error ? error.name : 'unknown' }))
        return undefined
      },
    )
    return read
  }
}
