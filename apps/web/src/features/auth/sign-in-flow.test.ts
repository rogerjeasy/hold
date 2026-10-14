// @vitest-environment node
import { createFakeIdentity } from '@hold/auth'
import type { FakeIdentity, Identity } from '@hold/auth'
import { createInvitation, findPerson, inShop, registerOwner, takeRateToken } from '@hold/db'
import type { Database } from '@hold/db'
import { createTestDatabase } from '@hold/db/testing'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Attempt } from './attempt'
import { answerCode, answerPasskey, beginInvitation, beginPasskey, beginSignIn, beginSignUp, LIMITS, resendCode } from './sign-in-flow'
import type { Begun, FlowDependencies, ProofOutcome } from './sign-in-flow'

// A real PostgreSQL in WebAssembly answers its first queries slowly on a busy machine.
vi.setConfig({ testTimeout: 30_000 })

const NOW = new Date('2026-10-14T09:00:00Z')
const TOMAS = { name: 'Tomás', shopName: 'Ribeira Bikes', email: 'tomas@ribeirabikes.example', timeZone: 'Europe/Lisbon', language: 'pt' }
// Each test asks from a network of its own, so the per-network limit only bites where a test means it to.
let network = 0
const from = () => ({ network: `network-${String(network)}` })
// Each test counts against limits of its own.
let run = 0

let database: Database
let identity: FakeIdentity
let flow: FlowDependencies

beforeAll(async () => {
  database = await createTestDatabase()
})

beforeEach(() => {
  network += 1
  run += 1
  const thisRun = run
  identity = createFakeIdentity({ now: () => NOW })
  flow = { identity, database, now: () => NOW, allow: (limit, subject) => takeRateToken(database, limit, `${String(thisRun)}:${subject}`) }
})

function begun(result: Begun): Attempt {
  if (!result.ok) throw new Error(`Expected an attempt, got ${result.notice}.`)
  return result.attempt
}

async function signUp(input = TOMAS): Promise<ProofOutcome> {
  const attempt = begun(await beginSignUp(flow, input, from()))
  return answerCode(flow, attempt, identity.lastCodeFor(input.email) ?? '', from())
}

async function subjectOf(outcome: ProofOutcome): Promise<string> {
  if (outcome.kind !== 'signed_in') throw new Error(`Expected to be signed in, got ${outcome.kind}.`)
  const verified = await identity.verifyAccessToken(outcome.tokens.accessToken)
  if (!verified.ok) throw new Error('The token did not verify.')
  return verified.value.subject
}

describe('signing up', () => {
  it('confirms the address, signs the owner in, and creates their shop', async () => {
    const attempt = begun(await beginSignUp(flow, TOMAS, from()))
    expect(attempt).toMatchObject({ page: 'signUp', step: 'confirm_sign_up', email: TOMAS.email, expiresAt: NOW.getTime() + 10 * 60 * 1000 })

    const outcome = await answerCode(flow, attempt, identity.lastCodeFor(TOMAS.email) ?? '', from())
    const person = await findPerson(database, await subjectOf(outcome))
    expect(person).toMatchObject({ email: TOMAS.email, name: 'Tomás', shops: [{ name: 'Ribeira Bikes', role: 'owner' }] })
    expect(identity.groupsOf(TOMAS.email)).toEqual(['owner'])
  })

  it('gives an address that already has an account a sign-in code, then adds the new shop to it', async () => {
    const ana = { ...TOMAS, email: 'ana@lisboa.example', shopName: 'Lisboa Bikes' }
    const first = await subjectOf(await signUp(ana))

    const again = begun(await beginSignUp(flow, { ...ana, shopName: 'Lisboa Kayaks' }, from()))
    expect(again.step).toBe('answer_sign_in')
    const second = await subjectOf(await answerCode(flow, again, identity.lastCodeFor(ana.email) ?? '', from()))

    expect(second).toBe(first)
    expect((await findPerson(database, first))?.shops.map((shop) => shop.name)).toEqual(['Lisboa Bikes', 'Lisboa Kayaks'])
  })

  it('sends a new confirmation code to an address whose sign-up was never finished, then a sign-in code', async () => {
    const rui = { ...TOMAS, email: 'rui@porto.example' }
    await beginSignUp(flow, rui, from())

    const again = begun(await beginSignUp(flow, rui, from()))
    expect(again.step).toBe('confirm_sign_up')
    // A resent confirmation code comes with no way to sign in straight after, so a sign-in code follows.
    const confirmed = await answerCode(flow, again, identity.lastCodeFor(rui.email) ?? '', from())
    if (confirmed.kind !== 'next_code') throw new Error(`Expected a second code, got ${confirmed.kind}.`)
    const signedIn = await answerCode(flow, confirmed.attempt, identity.lastCodeFor(rui.email) ?? '', from())
    expect(await findPerson(database, await subjectOf(signedIn))).toMatchObject({ shops: [{ name: 'Ribeira Bikes' }] })
  })

  it('creates nothing for a wrong code', async () => {
    const attempt = begun(await beginSignUp(flow, { ...TOMAS, email: 'wrong@code.example' }, from()))

    expect(await answerCode(flow, attempt, '00000000', from())).toEqual({ kind: 'failed', failure: 'wrong' })
  })

  it('reports the database being down, and leaves the account to finish by signing up again', async () => {
    const broken = { ...flow, database: { transaction: () => Promise.reject(new Error('down')) } as unknown as Database }
    const attempt = begun(await beginSignUp(flow, { ...TOMAS, email: 'later@shop.example' }, from()))

    expect(await answerCode(broken, attempt, identity.lastCodeFor('later@shop.example') ?? '', from())).toEqual({ kind: 'failed', failure: 'unavailable' })
    expect(begun(await beginSignUp(flow, { ...TOMAS, email: 'later@shop.example' }, from())).step).toBe('answer_sign_in')
  })
})

describe('signing in', () => {
  it('signs an owner in with the emailed code, creating nothing new', async () => {
    const subject = await subjectOf(await signUp({ ...TOMAS, email: 'marta@braga.example' }))

    const attempt = begun(await beginSignIn(flow, { email: 'marta@braga.example', language: 'pt' }, from()))
    expect(attempt).toMatchObject({ page: 'signIn', step: 'answer_sign_in' })
    expect(await subjectOf(await answerCode(flow, attempt, identity.lastCodeFor('marta@braga.example') ?? '', from()))).toBe(subject)
    expect((await findPerson(database, subject))?.shops).toHaveLength(1)
  })

  it('answers an address with no account exactly as one with an account', async () => {
    const unknown = begun(await beginSignIn(flow, { email: 'nobody@shop.example', language: 'en' }, from()))

    expect({ ...unknown, email: '', session: '' }).toEqual({ page: 'signIn', step: 'answer_sign_in', email: '', session: '', language: 'en', expiresAt: unknown.expiresAt })
    expect(await answerCode(flow, unknown, '12345678', from())).toEqual({ kind: 'failed', failure: 'wrong' })
  })

  it('sends a new code on request, and the new one works', async () => {
    await signUp({ ...TOMAS, email: 'resend@shop.example' })
    const first = begun(await beginSignIn(flow, { email: 'resend@shop.example', language: 'en' }, from()))

    const second = begun(await resendCode(flow, first, from()))
    expect(second.session).not.toBe(first.session)
    expect((await answerCode(flow, second, identity.lastCodeFor('resend@shop.example') ?? '', from())).kind).toBe('signed_in')
  })

  it('says to wait when the identity service has had too many requests', async () => {
    const busy: Identity = { ...identity, startSignIn: () => Promise.resolve({ ok: false, error: { kind: 'too_many_requests' } }) }

    expect(await beginSignIn({ ...flow, identity: busy }, { email: 'busy@shop.example', language: 'en' }, from())).toEqual({ ok: false, notice: 'busy' })
  })
})

describe('Hold’s own rate limit', () => {
  it('sends an address only so many codes, whoever asks', async () => {
    const results = []
    for (let request = 0; request <= LIMITS.codeEmailsPerAddress.max; request += 1) {
      network += 1000
      results.push((await beginSignIn(flow, { email: 'pestered@shop.example', language: 'en' }, from())).ok)
    }
    expect(results.at(-1)).toBe(false)
    expect(results.slice(0, -1).every(Boolean)).toBe(true)
  })

  it('limits one network across addresses', async () => {
    const results = []
    for (let request = 0; request <= LIMITS.requestsPerNetwork.max; request += 1) {
      results.push((await beginSignIn(flow, { email: `person-${String(request)}@shop.example`, language: 'en' }, from())).ok)
    }
    expect(results.at(-1)).toBe(false)
  })

  it('limits a request with no network address by its address alone', async () => {
    const results = []
    for (let request = 0; request <= LIMITS.requestsPerNetwork.max; request += 1) {
      results.push((await beginSignIn(flow, { email: `local-${String(request)}@shop.example`, language: 'en' }, { network: undefined })).ok)
    }
    expect(results.every(Boolean)).toBe(true)
  })
})

describe('accepting an invitation', () => {
  async function invitationFor(email: string) {
    const owner = await registerOwner(database, { subject: `owner-${email}`, email: `owner-${email}`, name: 'Owner', language: 'en', shop: { name: 'Douro Bikes', timeZone: 'UTC' } })
    const { token } = await inShop(database, { role: 'hold_app', shopId: owner.shopId, userId: owner.userId }, (transaction) =>
      createInvitation(transaction, { shopId: owner.shopId, invitedByUserId: owner.userId, email, role: 'counter_staff', approvalLimitCents: 0, language: 'en' }, NOW),
    )
    return { token, shopId: owner.shopId }
  }

  it('sends the code to the invited address, and gives the role once it is typed', async () => {
    const { token, shopId } = await invitationFor('new.staff@shop.example')
    const attempt = begun(await beginInvitation(flow, { token, name: 'Inês', language: 'pt' }, from()))
    expect(attempt).toMatchObject({ page: 'invite', email: 'new.staff@shop.example', invitation: { token, name: 'Inês' } })

    const subject = await subjectOf(await answerCode(flow, attempt, identity.lastCodeFor('new.staff@shop.example') ?? '', from()))
    expect(await findPerson(database, subject)).toMatchObject({ name: 'Inês', shops: [{ shopId, role: 'counter_staff' }] })
    expect(identity.groupsOf('new.staff@shop.example')).toEqual(['staff'])
  })

  it('works once', async () => {
    const { token } = await invitationFor('once.staff@shop.example')
    await subjectOf(await answerCode(flow, begun(await beginInvitation(flow, { token, name: 'O', language: 'en' }, from())), identity.lastCodeFor('once.staff@shop.example') ?? '', from()))

    expect(await beginInvitation(flow, { token, name: 'O', language: 'en' }, from())).toEqual({ ok: false, notice: 'invitation_closed' })
  })

  it('opens nothing for a made-up token', async () => {
    expect(await beginInvitation(flow, { token: 'made-up', name: 'X', language: 'en' }, from())).toEqual({ ok: false, notice: 'invitation_closed' })
  })
})

describe('passkeys', () => {
  async function ownerWithPasskey(email: string) {
    const outcome = await signUp({ ...TOMAS, email })
    if (outcome.kind !== 'signed_in') throw new Error('Expected to be signed in.')
    await identity.finishPasskeyRegistration(outcome.tokens.accessToken, JSON.stringify({ id: `credential-${email}` }))
  }

  it('signs in with a registered passkey, and returns to the page that asked', async () => {
    await ownerWithPasskey('passkey@shop.example')
    const started = await beginPasskey(flow, { email: 'passkey@shop.example', language: 'en', page: 'confirm', returnTo: '/shop/staff' }, from())
    if (!started.ok) throw new Error(`Expected a passkey attempt, got ${started.notice}.`)
    expect(started.attempt).toMatchObject({ step: 'answer_passkey', returnTo: '/shop/staff' })
    expect(JSON.parse(started.requestOptions)).toMatchObject({ userVerification: 'required' })

    expect((await answerPasskey(flow, started.attempt, JSON.stringify({ id: 'credential-passkey@shop.example' }), from())).kind).toBe('signed_in')
  })

  it('refuses a passkey that is not the person’s', async () => {
    await ownerWithPasskey('mine@shop.example')
    const started = await beginPasskey(flow, { email: 'mine@shop.example', language: 'en', page: 'signIn' }, from())
    if (!started.ok) throw new Error('Expected a passkey attempt.')

    expect(await answerPasskey(flow, started.attempt, JSON.stringify({ id: 'someone-elses' }), from())).toEqual({ kind: 'failed', failure: 'wrong' })
  })

  it('says when an address has no passkey', async () => {
    expect(await beginPasskey(flow, { email: 'nokey@shop.example', language: 'en', page: 'signIn' }, from())).toEqual({ ok: false, notice: 'no_passkey' })
  })

  it('does not take a code attempt as a passkey', async () => {
    const attempt = begun(await beginSignIn(flow, { email: 'code@shop.example', language: 'en' }, from()))

    expect(await answerPasskey(flow, attempt, '{"id":"x"}', from())).toEqual({ kind: 'failed', failure: 'attempt_over' })
  })
})
