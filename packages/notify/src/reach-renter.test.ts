import { describe, expect, it, vi } from 'vitest'
import { createMemoryMailer } from './mailer.ts'
import { reachRenter } from './reach-renter.ts'
import type { ReachDependencies, ReachTarget } from './reach-renter.ts'
import { createMemoryTexter } from './texter.ts'
import type { Texter } from './texter.ts'

const email = { to: 'priya@example.org', subject: 'Your rental', text: 'Your link: https://hold.example/r/T' }
const message = { purpose: 'renter_link', email, text: 'Ribeira Bikes: your link https://hold.example/r/T' } as const
const texting: ReachTarget = { shopId: 'shop-1', rentalId: 'rental-1', channel: 'text', phone: '+41791234567', simulated: false }

function dependencies(texter: Texter = createMemoryTexter(), allowed = true) {
  const recorded: unknown[] = []
  const stopped: string[] = []
  const mailer = createMemoryMailer()
  const reach: ReachDependencies = {
    mailer,
    texter,
    recordText: (record) => { recorded.push(record); return Promise.resolve() },
    allowText: () => Promise.resolve(allowed),
    stopTexts: (rentalId) => { stopped.push(rentalId); return Promise.resolve() },
  }
  return { reach, mailer, recorded, stopped }
}

describe('reaching a renter', () => {
  it('texts a renter who chose texts, records the text without its words, and sends no email', async () => {
    const texter = createMemoryTexter()
    const { reach, mailer, recorded } = dependencies(texter)
    expect(await reachRenter(reach, texting, message)).toEqual({ via: 'text', simulated: false, fellBack: null })
    expect(texter.sent).toEqual([{ to: '+41791234567', body: message.text, context: { shopId: 'shop-1', rentalId: 'rental-1' } }])
    expect(recorded).toEqual([{ rentalId: 'rental-1', purpose: 'renter_link', toPhone: '+41791234567', status: 'sent', providerMessageId: 'memory-1', body: null, failure: null }])
    expect(mailer.sent).toEqual([])
  })

  it('emails a renter who chose email', async () => {
    const { reach, mailer, recorded } = dependencies()
    expect(await reachRenter(reach, { ...texting, channel: 'email' }, message)).toEqual({ via: 'email', simulated: false, fellBack: null })
    expect(mailer.sent).toEqual([email])
    expect(recorded).toEqual([])
  })

  it('in a demo shop, shows the text on the renter’s page instead of sending it', async () => {
    const texter = createMemoryTexter()
    const { reach, recorded } = dependencies(texter)
    expect(await reachRenter(reach, { ...texting, simulated: true }, message)).toEqual({ via: 'text', simulated: true, fellBack: null })
    expect(texter.sent).toEqual([])
    expect(recorded).toEqual([expect.objectContaining({ status: 'simulated', body: message.text, providerMessageId: null })])
  })

  it('emails instead when the day’s texts are spent, without trying to text', async () => {
    const texter = createMemoryTexter()
    const { reach, mailer } = dependencies(texter, false)
    expect(await reachRenter(reach, texting, message)).toEqual({ via: 'email', simulated: false, fellBack: 'limit' })
    expect(texter.sent).toEqual([])
    expect(mailer.sent).toEqual([email])
  })

  it('emails instead when the text fails, and records the failure', async () => {
    const failing: Texter = { send: () => Promise.resolve({ ok: false, reason: 'unavailable' }) }
    const { reach, mailer, recorded } = dependencies(failing)
    expect(await reachRenter(reach, texting, message)).toEqual({ via: 'email', simulated: false, fellBack: 'unavailable' })
    expect(recorded).toEqual([expect.objectContaining({ status: 'failed', failure: 'unavailable' })])
    expect(mailer.sent).toEqual([email])
  })

  it('switches a renter who replied STOP back to email, and emails this message', async () => {
    const optedOut: Texter = { send: () => Promise.resolve({ ok: false, reason: 'opted_out' }) }
    const { reach, mailer, recorded, stopped } = dependencies(optedOut)
    expect(await reachRenter(reach, texting, message)).toEqual({ via: 'email', simulated: false, fellBack: 'opted_out' })
    expect(recorded).toEqual([expect.objectContaining({ status: 'opted_out' })])
    expect(stopped).toEqual(['rental-1'])
    expect(mailer.sent).toEqual([email])
  })

  it('never texts a country Hold does not send to, nor a renter with no phone', async () => {
    const texter = createMemoryTexter()
    const { reach } = dependencies(texter)
    expect(await reachRenter(reach, { ...texting, phone: '+881612345678' }, message)).toMatchObject({ via: 'email', fellBack: 'country' })
    expect(await reachRenter(reach, { ...texting, phone: null }, message)).toMatchObject({ via: 'email', fellBack: 'country' })
    expect(texter.sent).toEqual([])
  })

  it('reaches nobody when a message only a phone may take cannot be texted', async () => {
    const failing: Texter = { send: () => Promise.resolve({ ok: false, reason: 'unavailable' }) }
    const { reach, mailer } = dependencies(failing)
    expect(await reachRenter(reach, texting, { ...message, purpose: 'phone_code', email: null })).toEqual({ via: 'none', simulated: false, fellBack: 'unavailable' })
    expect(mailer.sent).toEqual([])
  })

  it('reaches nobody when the email fails too', async () => {
    const { reach } = dependencies()
    const unsent = { ...reach, mailer: { send: () => Promise.resolve(false) } }
    expect(await reachRenter(unsent, { ...texting, channel: 'email' }, message)).toEqual({ via: 'none', simulated: false, fellBack: null })
  })

  it('holds an email once the day’s emails are spent, sending nothing and saying so', async () => {
    const asked: unknown[] = []
    const { reach, mailer } = dependencies()
    const spent = { ...reach, allowEmail: (target: unknown) => { asked.push(target); return Promise.resolve(false) } }
    expect(await reachRenter(spent, { ...texting, channel: 'email' }, message)).toEqual({ via: 'none', simulated: false, fellBack: null, emailHeld: true })
    expect(mailer.sent).toEqual([])
    expect(asked).toEqual([{ shopId: 'shop-1', rentalId: 'rental-1', to: 'priya@example.org', purpose: 'renter_link' }])
    // A text is counted by its own allowance, never by the emails'.
    expect(await reachRenter(spent, texting, message)).toEqual({ via: 'text', simulated: false, fellBack: null })
  })

  it('counts each email it sends against the allowance', async () => {
    const asked: unknown[] = []
    const { reach, mailer } = dependencies()
    const counting = { ...reach, allowEmail: (target: unknown) => { asked.push(target); return Promise.resolve(true) } }
    expect(await reachRenter(counting, { ...texting, channel: 'email' }, message)).toEqual({ via: 'email', simulated: false, fellBack: null })
    expect(mailer.sent).toEqual([email])
    expect(asked).toHaveLength(1)
  })
})

describe('a push to the renter’s phone app, beside the message', () => {
  it('goes with each notice that has one, whichever way the renter is reached', async () => {
    const pushed: string[] = []
    const { reach } = dependencies()
    const withPush: ReachDependencies = { ...reach, push: (event) => { pushed.push(event); return Promise.resolve() } }
    await reachRenter(withPush, texting, { ...message, purpose: 'condition_link' })
    await reachRenter(withPush, { ...texting, channel: 'email' }, { ...message, purpose: 'receipt' })
    await reachRenter(withPush, { ...texting, simulated: true }, { ...message, purpose: 'reminder' })
    expect(pushed).toEqual(['condition_ready', 'receipt', 'due_back'])
  })

  it('never goes with a one-time code or the link itself', async () => {
    const push = vi.fn(() => Promise.resolve())
    const { reach } = dependencies()
    for (const purpose of ['renter_code', 'phone_code', 'renter_link'] as const) await reachRenter({ ...reach, push }, texting, { ...message, purpose })
    expect(push).not.toHaveBeenCalled()
  })

  it('never changes how the renter was reached when it fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { reach, recorded } = dependencies()
    const failing: ReachDependencies = { ...reach, push: () => Promise.reject(new Error('Expo is down')) }
    expect(await reachRenter(failing, texting, { ...message, purpose: 'drop_off' })).toEqual({ via: 'text', simulated: false, fellBack: null })
    expect(recorded).toHaveLength(1)
    warn.mockRestore()
  })
})
