import { z } from 'zod'
import { answerSchema, failedSchema } from './envelope'
import type { Failed } from './envelope'
import { renterActions } from './renter-actions'
import type { RenterActionInput, RenterActionName, RenterActionOutput } from './renter-actions'
import { renterIncidentSchema, renterViews } from './renter-views'
import type { RenterIncidentView, RenterView, RenterViewName } from './renter-views'
import { MOBILE_API_BASE } from './staff'

// The phone app's way to the renter routes. The renter's link token is the bearer: keep it in the device's Keychain or
// Keystore (expo-secure-store), never in plain storage or a log. Each input is checked with the server's own schema
// before it is sent, and each answer is checked before it is believed.
//
// A view refused as link_invalid says only that this link cannot show that screen: a rental with no assistant answers
// so, as on the web. Whether the link itself still works is what the rental view says.

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

// unavailable: Hold could not be reached, or what came back was not an answer. Nothing is known to have happened.
export type RenterAnswer<Value> = { readonly ok: true; readonly value: Value } | Failed | { readonly ok: false; readonly failure: 'unavailable' }

export type RenterClientOptions = { readonly baseUrl: string; readonly token: string; readonly locale: string; readonly fetch: Fetch }

const UNAVAILABLE = { ok: false, failure: 'unavailable' } as const

async function ask<Value extends z.ZodType>(fetcher: Fetch, url: string, init: RequestInit, value: Value): Promise<RenterAnswer<z.output<Value>>> {
  let body: unknown
  try {
    body = await (await fetcher(url, init)).json()
  } catch {
    return UNAVAILABLE
  }
  const parsed = answerSchema(value).safeParse(body)
  return parsed.success ? (parsed.data as RenterAnswer<z.output<Value>>) : UNAVAILABLE
}

export function renterApi({ baseUrl, token, locale, fetch: fetcher }: RenterClientOptions) {
  const headers = { authorization: `Bearer ${token}`, 'accept-language': locale }
  const at = (path: string) => `${baseUrl}${MOBILE_API_BASE}/renter/${path}`
  return {
    view: <Name extends RenterViewName>(name: Name): Promise<RenterAnswer<RenterView<Name>>> => ask(fetcher, at(name), { method: 'GET', headers }, renterViews[name]) as Promise<RenterAnswer<RenterView<Name>>>,
    incident: (incidentId: string): Promise<RenterAnswer<RenterIncidentView>> => ask(fetcher, at(`incident/${encodeURIComponent(incidentId)}`), { method: 'GET', headers }, renterIncidentSchema),
    act: async <Name extends RenterActionName>(name: Name, input: RenterActionInput<Name>): Promise<RenterAnswer<RenterActionOutput<Name>>> => {
      const checked = renterActions[name].input.safeParse(input)
      if (!checked.success) return failedSchema.parse({ ok: false, failure: 'invalid', fields: [...new Set(checked.error.issues.map((issue) => issue.path.join('.')))] })
      const init = { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(checked.data) }
      return ask(fetcher, at(`actions/${name}`), init, renterActions[name].output) as Promise<RenterAnswer<RenterActionOutput<Name>>>
    },
  }
}

export type RenterApi = ReturnType<typeof renterApi>
