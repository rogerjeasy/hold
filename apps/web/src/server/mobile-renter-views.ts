import 'server-only'
import { renterIncidentSchema, renterViews } from '@hold/mobile-api'
import type { RenterViewName } from '@hold/mobile-api'
import type { z } from 'zod'
import { assistantPage } from './assistant-page'
import { cleanRecordPage } from './clean-record'
import { extensionPage } from './extension-page'
import { incidentPage, incidentsPage } from './incident-page'
import type { MobileAnswer } from './mobile-json'
import { renterClaimPage } from './renter-claim-page'
import { conditionPage, renterHoldPage, renterPage } from './renter-page'
import { renterNegotiationPage } from './renter-negotiation-page'
import { renterRecordPage } from './renter-record-page'
import { selfReturnPage } from './self-return-page'

// Each renter screen the phone reads, from the very loader the renter's web page uses, which checks the link, its
// scope and rate. What leaves is parsed through the contract's schema: times become ISO text on the way, and every
// field the schema does not name, such as the shop's PayPal app for its web button, is dropped.

type Refused = { readonly ok: false; readonly failure: 'link_invalid' | 'scope' | 'rate_limited' | 'not_found' }
type Loaded = { readonly ok: true; readonly value: unknown } | Refused

// As JSON would carry it, then only what the schema names.
const shaped = (schema: z.ZodType, loaded: Loaded): MobileAnswer => (loaded.ok ? { ok: true, value: schema.parse(JSON.parse(JSON.stringify(loaded.value))) } : loaded)

const LOADERS: Readonly<Record<RenterViewName, (token: string, locale: string) => Promise<Loaded>>> = {
  rental: async (token) => {
    const page = await renterPage(token)
    return page.ok ? { ok: true, value: { view: page.view, canReport: page.canReport, canExtend: page.canExtend, askConsent: page.askConsent, assistant: page.assistant, selfReturn: page.selfReturn, contact: page.contact ?? null } } : page
  },
  hold: async (token) => {
    const page = await renterHoldPage(token)
    return page.ok ? { ok: true, value: { view: page.view, hold: page.hold ?? null, contact: page.contact ?? null } } : page
  },
  condition: async (token) => {
    const page = await conditionPage(token)
    return page.ok ? { ok: true, value: page.report } : { ok: false, failure: page.failure === 'not_handed_over' ? 'not_found' : page.failure }
  },
  claim: async (token, locale) => {
    const page = await renterClaimPage(token, locale)
    return page.ok ? { ok: true, value: { ...page.data, contest: page.data.contest ?? null } } : page
  },
  negotiation: async (token) => {
    const page = await renterNegotiationPage(token)
    return page.ok ? { ok: true, value: { shopName: page.shopName, canAct: page.canAct, ...page.data } } : page
  },
  extension: async (token) => {
    const page = await extensionPage(token)
    return page.ok ? { ok: true, value: page.data } : page
  },
  incidents: async (token) => {
    const page = await incidentsPage(token)
    return page.ok ? { ok: true, value: page } : page
  },
  return: async (token) => {
    const page = await selfReturnPage(token)
    return page.ok ? { ok: true, value: { ...page.data, opening: page.data.opening ?? null } } : page
  },
  record: async (token) => {
    const page = await renterRecordPage(token, {})
    return page.ok ? { ok: true, value: page } : page
  },
  trust: async (token, locale) => {
    const page = await cleanRecordPage(token, locale)
    return page.ok ? { ok: true, value: { ...page.view, own: page.view.own ?? null, credential: page.view.credential ?? null } } : page
  },
  assistant: async (token) => {
    const page = await assistantPage(token)
    return page.ok ? { ok: true, value: page.view } : page
  },
}

export async function renterViewAnswer(name: RenterViewName, token: string, locale: string): Promise<MobileAnswer> {
  return shaped(renterViews[name], await LOADERS[name](token, locale))
}

export async function renterIncidentAnswer(token: string, incidentId: string): Promise<MobileAnswer> {
  const page = await incidentPage(token, incidentId)
  return shaped(renterIncidentSchema, page.ok ? { ok: true, value: page } : page)
}
