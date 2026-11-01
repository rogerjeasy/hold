import { renterApi } from '@hold/mobile-api'
import * as actionRoute from '@/app/api/mobile/v1/renter/actions/[name]/route'
import * as incidentRoute from '@/app/api/mobile/v1/renter/incident/[incidentId]/route'
import * as viewRoute from '@/app/api/mobile/v1/renter/[view]/route'

// For tests of the phone's renter routes: the phone app's own client, with its requests handed to the route handlers
// as Next.js would hand them. Each test file mocks next/headers itself.

const BASE = 'https://hold.test'
const RENTER = '/api/mobile/v1/renter/'

export function phoneFetch(url: string, init?: RequestInit): Promise<Response> {
  const request = new Request(url, init)
  const path = new URL(url).pathname.slice(RENTER.length).split('/').map(decodeURIComponent)
  if (path[0] === 'actions' && path.length === 2) return actionRoute.POST(request, { params: Promise.resolve({ name: path[1] ?? '' }) })
  if (path[0] === 'incident' && path.length === 2) return incidentRoute.GET(request, { params: Promise.resolve({ incidentId: path[1] ?? '' }) })
  return viewRoute.GET(request, { params: Promise.resolve({ view: path[0] ?? '' }) })
}

export const renterPhone = (token: string, locale = 'en') => renterApi({ baseUrl: BASE, token, locale, fetch: phoneFetch })

// A request as an untyped caller could send it, with whatever headers and body it likes.
export function rawAction(name: string, init: { readonly authorization?: string; readonly body?: string; readonly headers?: Record<string, string> }): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...init.headers }
  if (init.authorization !== undefined) headers['authorization'] = init.authorization
  return phoneFetch(`${BASE}${RENTER}actions/${encodeURIComponent(name)}`, { method: 'POST', headers, body: init.body ?? '{}' })
}

export function rawView(path: string, authorization?: string): Promise<Response> {
  return phoneFetch(`${BASE}${RENTER}${path}`, { method: 'GET', headers: authorization === undefined ? {} : { authorization } })
}
