import { formatMoney, money } from '@hold/domain'
import type { ItemCategory } from '@hold/domain'
import type { AssistantModel, Block, Conversation, ModelReply } from './model.ts'

// The hosted assistant's stand-in where Claude cannot be reached, as in the test environment: a fixed script, labelled
// as simulated wherever its words appear. It follows one path (find a shop, check what is free, read the prices, quote,
// book when told to, check the payment) and copies every amount from Hold's results, as the real model must.

const SIMULATED_MODEL = 'simulated-script'
type Result = Readonly<Record<string, unknown>>

const KINDS: readonly (readonly [RegExp, ItemCategory])[] = [
  [/e-?bike|electric bike/i, 'e_bike'],
  [/kayak|paddle|canoe|boat|surf/i, 'water'],
  [/ski|snowboard/i, 'snow'],
  [/scooter/i, 'scooter'],
  [/camera|lens/i, 'camera'],
  [/tent|camping/i, 'camping'],
  [/bike|bicycle/i, 'bike'],
]
// "at Ribeira Bikes", "in Lisbon": the shop or the place the person names, up to the end of the phrase.
const PLACE = /\b(?:at|in|near)\s+([\p{L}\d' -]{2,60}?)\s*(?:[.,!?;]|$)/u
const YES = /\b(yes|yeah|ok|okay|go ahead|book|please do|sí|si|oui|ja|vale|d'accord)\b/i

const reply = (content: readonly Block[], stopReason: 'end_turn' | 'tool_use'): ModelReply => ({ kind: 'reply', content, stopReason, tokens: 0, model: SIMULATED_MODEL })
const say = (text: string) => reply([{ type: 'text', text }], 'end_turn')
let calls = 0
const use = (name: string, input: Record<string, unknown>) => reply([{ type: 'tool_use', id: `simulated-${String((calls += 1))}`, name, input }], 'tool_use')

// Each tool the script called, with what it sent and what Hold returned, latest last.
function exchanges(conversation: Conversation): { readonly name: string; readonly input: Result; readonly result: Result; readonly ok: boolean }[] {
  const results = new Map(conversation.flatMap((message) => message.content).flatMap((block) => (block.type === 'tool_result' ? [[block.tool_use_id, block] as const] : [])))
  return conversation
    .flatMap((message) => message.content)
    .flatMap((block) => {
      if (block.type !== 'tool_use') return []
      const answer = results.get(block.id)
      return answer === undefined ? [] : [{ name: block.name, input: block.input, result: JSON.parse(answer.content) as Result, ok: !answer.is_error }]
    })
}

const latest = (conversation: Conversation, name: string) => exchanges(conversation).filter((each) => each.name === name).at(-1)
const amount = (value: unknown) => {
  const { cents, currency } = value as { cents: number; currency: string }
  return formatMoney(money(cents, currency), 'en')
}
const words = (value: unknown) => (value as { merchant_words: string }).merchant_words

// Ten in the morning on the shop's clock, so many days from today.
function shopMorning(timeZone: string, now: Date, days: number): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now.getTime() + days * 86_400_000))
  return `${day}T10:00`
}

function afterTool(conversation: Conversation, now: Date): ModelReply {
  const last = exchanges(conversation).at(-1)
  if (last === undefined) return say('I could not reach Hold.')
  if (!last.ok) return say(`Hold refused that (${typeof last.result['error'] === 'string' ? last.result['error'] : 'refused'}).`)
  const { result } = last
  switch (last.name) {
    case 'find_shops': {
      const shop = (result['shops'] as readonly Result[])[0]
      if (shop === undefined) return say('I found no shop on Hold with that to rent.')
      const timeZone = String(shop['time_zone'])
      return use('check_availability', { shop: shop['shop'], starts_at: shopMorning(timeZone, now, 1), ends_at: shopMorning(timeZone, now, 4) })
    }
    case 'check_availability': {
      const free = (result['item_types'] as readonly Result[]).find((type) => Number(type['available']) > 0)
      if (free === undefined) return say('Nothing is free at that shop for those days.')
      return use('get_damage_prices', { shop: result['shop'] })
    }
    case 'get_damage_prices': {
      const asked = latest(conversation, 'check_availability')
      const free = (asked?.result['item_types'] as readonly Result[]).find((type) => Number(type['available']) > 0)
      return use('quote_rental', { shop: asked?.input['shop'], starts_at: asked?.input['starts_at'], ends_at: asked?.input['ends_at'], items: [{ item_type_id: free?.['item_type_id'], count: 1 }] })
    }
    case 'quote_rental': {
      const line = (result['lines'] as readonly Result[])[0]
      const price = (latest(conversation, 'get_damage_prices')?.result['prices'] as readonly Result[] | undefined)?.[0]
      const damage = price === undefined ? '' : ` If it came back with "${words(price['description'])}", the shop's price is ${amount(price['amount'])}.`
      return say(`I can rent you one ${words(line?.['name'])} for ${String(result['days'])} days for ${amount(result['fee'])}. At pickup PayPal holds ${amount(result['hold'])}, released after the return.${damage} Shall I book it?`)
    }
    case 'create_booking':
      return say(`Booked. The item is kept for fifteen minutes while you approve the fee of ${amount(result['fee'])} in PayPal with the link below. Tell me when you have.`)
    case 'get_booking':
      if (result['status'] === 'paid') return say('PayPal has the fee: your rental is booked. I can now follow its hold and condition report for you.')
      if (result['status'] === 'awaiting_payment') return say('The fee is not paid yet. Approve it in PayPal with the link I gave you.')
      return say('That booking is no longer waiting for payment. I can find you another one.')
    default:
      return say('Done.')
  }
}

function afterPerson(conversation: Conversation, text: string): ModelReply {
  const booking = latest(conversation, 'create_booking')
  if (booking?.ok === true) return use('get_booking', { booking_secret: booking.result['booking_secret'] })
  const quote = latest(conversation, 'quote_rental')
  if (quote?.ok === true && YES.test(text)) return use('create_booking', { quote_id: quote.result['quote_id'] })
  const kind = KINDS.find(([pattern]) => pattern.test(text))?.[1]
  const place = PLACE.exec(text)?.[1]?.trim()
  return use('find_shops', { ...(kind === undefined ? {} : { kind }), ...(place === undefined ? {} : { place }) })
}

export function createScriptedModel(now: () => Date): AssistantModel {
  return {
    simulated: true,
    reply(request) {
      const last = request.messages.at(-1)
      const said = last?.role === 'user' ? last.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join(' ') : ''
      return Promise.resolve(said === '' ? afterTool(request.messages, now()) : afterPerson(request.messages, said))
    },
  }
}
