import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { addDays, HOLD_ASSURED_DAYS } from '@hold/domain'
import { describe, must, startTrial } from './support.ts'

// Trial 3 in tech-stack.md section 16, run for real by waiting instead of moving a clock. PayPal allows a renewal
// only from day 4, so this runs in two steps:
//   place               today: places a plain hold (E) and a walk-in hold whose fee is captured (F), and saves them
//   renew               after day 3: renews both, then checks what the new and old identifiers allow
//   place-unrenewed     today: places a plain hold (G) that will never be renewed
//   capture-unrenewed   after day 3: captures G as it is, outside its assured period. Hold falls back to this when a
//                       renewal fails or is spent (architecture.md section 7.4)

const FEE_CENTS = 45_00
const DEPOSIT_CENTS = 150_00
const DAMAGE_CENTS = 40_00
const PROBE_CENTS = 1_00
const STATE_FILE = join(import.meta.dirname, 'recordings', 'renewal-state.json')

type Saved = { readonly authorizationId: string; readonly createdAt: string; readonly expiresAt: string }
type State = { readonly plain: Saved; readonly walkIn: Saved; readonly unrenewed?: Saved }

const STEPS = ['place', 'renew', 'place-unrenewed', 'capture-unrenewed'] as const
const step = STEPS.find((name) => name === process.argv[2])
if (step === undefined) throw new Error(`Say which step: ${STEPS.join(', ')}.`)

const save = (authorization: { authorizationId: string; createdAt: Date; expiresAt: Date }): Saved => ({
  authorizationId: authorization.authorizationId,
  createdAt: authorization.createdAt.toISOString(),
  expiresAt: authorization.expiresAt.toISOString(),
})

function refuseBeforeDayFour(saved: Saved): void {
  const ready = addDays(new Date(saved.createdAt), HOLD_ASSURED_DAYS)
  if (new Date() < ready) throw new Error(`Too early. Run this step after ${ready.toISOString()}.`)
}

const trial = startTrial(`renewal-hold-${step}`)
const { holds } = trial

if (step === 'place') {
  const [plain, walkIn] = await trial.placeApprovedHolds([
    { label: 'E. A plain hold, to be renewed after day 3', amount: trial.money(DEPOSIT_CENTS) },
    { label: 'F. A walk-in hold, fee captured now, to be renewed after day 3', amount: trial.money(FEE_CENTS + DEPOSIT_CENTS) },
  ])
  if (plain === undefined || walkIn === undefined) throw new Error('Two holds were expected.')

  const fee = await holds.captureFromHold({
    authorizationId: walkIn.authorizationId,
    amount: trial.money(FEE_CENTS),
    finalCapture: false,
    idempotencyKey: trial.key(),
  })
  trial.check('The walk-in fee is captured, not as the final capture', fee.ok, describe(fee, (capture) => `status ${capture.status}`))

  const state: State = { plain: save(plain), walkIn: save(walkIn) }
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2))
  const ready = addDays(new Date(state.walkIn.createdAt), HOLD_ASSURED_DAYS)
  console.log(`\nSaved. Run the renew step after ${ready.toISOString()}:\n  pnpm --filter @hold/paypal trial:renewal renew`)
} else if (step === 'place-unrenewed') {
  const state = JSON.parse(await readFile(STATE_FILE, 'utf8')) as State
  const [unrenewed] = await trial.placeApprovedHolds([
    { label: 'G. A plain hold, never renewed, to be captured after day 3', amount: trial.money(DEPOSIT_CENTS) },
  ])
  if (unrenewed === undefined) throw new Error('One hold was expected.')
  await writeFile(STATE_FILE, JSON.stringify({ ...state, unrenewed: save(unrenewed) }, null, 2))
  const ready = addDays(unrenewed.createdAt, HOLD_ASSURED_DAYS)
  console.log(`\nSaved. Run the capture step after ${ready.toISOString()}:\n  pnpm --filter @hold/paypal trial:renewal capture-unrenewed`)
} else if (step === 'capture-unrenewed') {
  const state = JSON.parse(await readFile(STATE_FILE, 'utf8')) as State
  const saved = state.unrenewed
  if (saved === undefined) throw new Error('Run place-unrenewed first.')
  refuseBeforeDayFour(saved)

  console.log('\nG. Plain hold, never renewed')
  const before = await holds.readAuthorization(saved.authorizationId)
  trial.check(
    'The hold still reads as held after its assured period',
    before.ok && before.value.status === 'created',
    describe(before, (authorization) => `status ${authorization.status}`),
  )
  const damage = await holds.captureFromHold({
    authorizationId: saved.authorizationId,
    amount: trial.money(DAMAGE_CENTS),
    finalCapture: true,
    idempotencyKey: trial.key(),
  })
  trial.check(
    'Damage is captured outside the assured period, with no renewal',
    damage.ok && damage.value.status === 'completed',
    describe(damage, (capture) => `status ${capture.status}, ${String(capture.amount.cents)} cents`),
  )
  const after = await holds.readAuthorization(saved.authorizationId)
  trial.check(
    'The authorization then reads as captured',
    after.ok && after.value.status === 'captured',
    describe(after, (authorization) => `status ${authorization.status}`),
  )
} else {
  const state = JSON.parse(await readFile(STATE_FILE, 'utf8')) as State
  refuseBeforeDayFour(state.walkIn)

  async function renewAndCapture(label: string, saved: Saved, expectedRemainingCents: number): Promise<string> {
    console.log(`\n${label}`)
    const renewed = await holds.renewHold({ authorizationId: saved.authorizationId, idempotencyKey: trial.key() })
    trial.check(
      'The renewal gives a new identifier',
      renewed.ok && renewed.value.authorizationId !== saved.authorizationId,
      describe(renewed, (authorization) => `${authorization.authorizationId}, status ${authorization.status}`),
    )
    const current = must(renewed, 'The renewal')
    trial.check(
      'The renewal covers what is still held',
      current.amount.cents === expectedRemainingCents,
      `${String(current.amount.cents)} cents, ${String(expectedRemainingCents)} expected`,
    )
    trial.check(
      'The renewal keeps the original end of validity',
      current.expiresAt.toISOString() === saved.expiresAt,
      `renewed ${current.expiresAt.toISOString()}, original ${saved.expiresAt}`,
    )

    const again = await holds.renewHold({ authorizationId: current.authorizationId, idempotencyKey: trial.key() })
    trial.check(
      'A second renewal is refused',
      !again.ok,
      describe(again, (authorization) => `RENEWED AGAIN as ${authorization.authorizationId}`),
    )
    const oldCapture = await holds.captureFromHold({
      authorizationId: saved.authorizationId,
      amount: trial.money(PROBE_CENTS),
      finalCapture: false,
      idempotencyKey: trial.key(),
    })
    trial.check(
      'The old identifier can no longer be captured',
      !oldCapture.ok,
      describe(oldCapture, (capture) => `CAPTURED ${String(capture.amount.cents)} cents on the old identifier`),
    )
    const damage = await holds.captureFromHold({
      authorizationId: current.authorizationId,
      amount: trial.money(DAMAGE_CENTS),
      finalCapture: true,
      idempotencyKey: trial.key(),
    })
    trial.check(
      'Damage is captured on the new identifier as the final capture',
      damage.ok && damage.value.status === 'completed',
      describe(damage, (capture) => `status ${capture.status}, ${String(capture.amount.cents)} cents`),
    )
    const after = await holds.readAuthorization(current.authorizationId)
    trial.check(
      'The new authorization reads as captured',
      after.ok && after.value.status === 'captured',
      describe(after, (authorization) => `status ${authorization.status}`),
    )
    const old = await holds.readAuthorization(saved.authorizationId)
    trial.check('The old authorization can still be read', old.ok, describe(old, (authorization) => `status ${authorization.status}`))
    return current.authorizationId
  }

  await renewAndCapture('E. Plain hold', state.plain, DEPOSIT_CENTS)
  await renewAndCapture('F. Walk-in hold, fee already captured', state.walkIn, DEPOSIT_CENTS)
}

await trial.finish()
