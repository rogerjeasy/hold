import { describe, must, startTrial } from './support.ts'

// Trial 1 in tech-stack.md section 16. A hold placed as its own authorize-first order is voided, and a second
// one is partly captured as the final capture. The remainder must be released.

const DEPOSIT_CENTS = 150_00
const DAMAGE_CENTS = 40_00
const PROBE_CENTS = 1_00
const EXPECTED_VALIDITY_DAYS = 29
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

const trial = startTrial('baseline-hold')
const { holds } = trial
const deposit = trial.money(DEPOSIT_CENTS)
const damage = trial.money(DAMAGE_CENTS)
const probe = trial.money(PROBE_CENTS)

const [cleanReturn, damagedReturn] = await trial.placeApprovedHolds([
  { label: 'A. Clean return: the hold is voided', amount: deposit },
  { label: 'B. Damage: part of the hold is captured as the final capture', amount: deposit },
])
if (cleanReturn === undefined || damagedReturn === undefined) throw new Error('Two holds were expected.')

console.log('\nA. Clean return')
trial.check(
  'The hold is placed for the full deposit',
  cleanReturn.status === 'created' && cleanReturn.amount.cents === DEPOSIT_CENTS,
  `status ${cleanReturn.status}, ${String(cleanReturn.amount.cents)} cents, authorization ${cleanReturn.authorizationId}`,
)
const validityDays = (cleanReturn.expiresAt.getTime() - cleanReturn.createdAt.getTime()) / MILLISECONDS_PER_DAY
trial.check(
  'PayPal gives the hold 29 days of validity',
  Math.round(validityDays) === EXPECTED_VALIDITY_DAYS,
  `created ${cleanReturn.createdAt.toISOString()}, expires ${cleanReturn.expiresAt.toISOString()}, ${validityDays.toFixed(2)} days`,
)

const released = await holds.releaseHold({ authorizationId: cleanReturn.authorizationId, idempotencyKey: trial.key() })
trial.check(
  'Voiding releases the hold',
  released.ok && released.value.status === 'voided',
  describe(released, (authorization) => `status ${authorization.status}`),
)
const afterVoid = await holds.captureFromHold({
  authorizationId: cleanReturn.authorizationId,
  amount: probe,
  finalCapture: true,
  idempotencyKey: trial.key(),
})
trial.check(
  'A voided hold cannot be captured',
  !afterVoid.ok,
  describe(afterVoid, (capture) => `CAPTURED ${String(capture.amount.cents)} cents as ${capture.captureId}`),
)

console.log('\nB. Damage')
const captureKey = trial.key()
const captureInput = { authorizationId: damagedReturn.authorizationId, amount: damage, finalCapture: true, idempotencyKey: captureKey }
const captured = await holds.captureFromHold(captureInput)
trial.check(
  'Part of the hold is captured as the final capture',
  captured.ok && captured.value.status === 'completed' && captured.value.amount.cents === DAMAGE_CENTS && captured.value.finalCapture,
  describe(
    captured,
    (capture) =>
      `status ${capture.status}, ${String(capture.amount.cents)} cents, final ${String(capture.finalCapture)}, capture ${capture.captureId}`,
  ),
)
const capture = must(captured, 'The final capture')

const repeated = await holds.captureFromHold(captureInput)
trial.check(
  'The same idempotency key does not capture twice',
  repeated.ok && repeated.value.captureId === capture.captureId,
  describe(repeated, (again) => `capture ${again.captureId}, first was ${capture.captureId}`),
)

const afterCapture = await holds.readAuthorization(damagedReturn.authorizationId)
trial.check(
  'The hold reads as captured, so the remainder is no longer reserved',
  afterCapture.ok && afterCapture.value.status === 'captured',
  describe(afterCapture, (authorization) => `status ${authorization.status}`),
)
const secondCapture = await holds.captureFromHold({
  authorizationId: damagedReturn.authorizationId,
  amount: probe,
  finalCapture: true,
  idempotencyKey: trial.key(),
})
trial.check(
  'Nothing more can be captured after the final capture',
  !secondCapture.ok,
  describe(secondCapture, (extra) => `CAPTURED ${String(extra.amount.cents)} cents as ${extra.captureId}`),
)
const voidAfterCapture = await holds.releaseHold({ authorizationId: damagedReturn.authorizationId, idempotencyKey: trial.key() })
trial.check(
  'A captured hold has nothing left to void',
  !voidAfterCapture.ok,
  describe(voidAfterCapture, (authorization) => `void accepted, status ${authorization.status}`),
)

await trial.finish()
