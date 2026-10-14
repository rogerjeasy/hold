import { describe, must, startTrial } from './support.ts'

// Trial 2 in tech-stack.md section 16. One authorization covers the rental fee and the deposit. The fee is
// captured at once as a capture that is not final. The rest must stay held, and must still be capturable and
// releasable. If it is not, a walk-in renter has to approve twice.

const FEE_CENTS = 45_00
const DEPOSIT_CENTS = 150_00
const DAMAGE_CENTS = 40_00
const PROBE_CENTS = 1_00

const trial = startTrial('combined-hold')
const { holds } = trial
const total = trial.money(FEE_CENTS + DEPOSIT_CENTS)
const fee = trial.money(FEE_CENTS)
const damage = trial.money(DAMAGE_CENTS)
const probe = trial.money(PROBE_CENTS)

const [withDamage, cleanReturn] = await trial.placeApprovedHolds([
  { label: 'C. Walk-in, then damage: fee captured, then part of the deposit', amount: total },
  { label: 'D. Walk-in, then a clean return: fee captured, then the rest voided', amount: total },
])
if (withDamage === undefined || cleanReturn === undefined) throw new Error('Two holds were expected.')

async function captureFee(authorizationId: string): Promise<void> {
  const captured = await holds.captureFromHold({ authorizationId, amount: fee, finalCapture: false, idempotencyKey: trial.key() })
  trial.check(
    'The fee is captured at once, not as the final capture',
    captured.ok && captured.value.status === 'completed' && captured.value.amount.cents === FEE_CENTS && !captured.value.finalCapture,
    describe(captured, (capture) => `status ${capture.status}, ${String(capture.amount.cents)} cents, final ${String(capture.finalCapture)}`),
  )
  must(captured, 'Capturing the fee')
  const remainder = await holds.readAuthorization(authorizationId)
  trial.check(
    'The rest stays held',
    remainder.ok && remainder.value.status === 'partially_captured',
    describe(remainder, (authorization) => `status ${authorization.status}, expires ${authorization.expiresAt.toISOString()}`),
  )
}

console.log('\nC. Walk-in, then damage')
await captureFee(withDamage.authorizationId)

// The sandbox cannot move time forward, so a renewal now can only show how PayPal refuses one inside the
// assured period. If it is accepted instead, later calls must use the new identifier.
const renewed = await holds.renewHold({ authorizationId: withDamage.authorizationId, idempotencyKey: trial.key() })
trial.check(
  'A renewal inside the assured period is refused as too soon',
  !renewed.ok && renewed.error.kind === 'renewal_too_soon',
  describe(renewed, (authorization) => `RENEWED as ${authorization.authorizationId}, status ${authorization.status}`),
)
const current = renewed.ok ? renewed.value.authorizationId : withDamage.authorizationId

const damageCapture = await holds.captureFromHold({ authorizationId: current, amount: damage, finalCapture: true, idempotencyKey: trial.key() })
trial.check(
  'Damage is captured from the remainder as the final capture',
  damageCapture.ok && damageCapture.value.status === 'completed' && damageCapture.value.amount.cents === DAMAGE_CENTS,
  describe(damageCapture, (capture) => `status ${capture.status}, ${String(capture.amount.cents)} cents, final ${String(capture.finalCapture)}`),
)
const afterDamage = await holds.readAuthorization(current)
trial.check(
  'The hold reads as captured, so what is left of the deposit is released',
  afterDamage.ok && afterDamage.value.status === 'captured',
  describe(afterDamage, (authorization) => `status ${authorization.status}`),
)
const extra = await holds.captureFromHold({ authorizationId: current, amount: probe, finalCapture: true, idempotencyKey: trial.key() })
trial.check(
  'Nothing more can be captured after the final capture',
  !extra.ok,
  describe(extra, (capture) => `CAPTURED ${String(capture.amount.cents)} cents as ${capture.captureId}`),
)

console.log('\nD. Walk-in, then a clean return')
await captureFee(cleanReturn.authorizationId)

const released = await holds.releaseHold({ authorizationId: cleanReturn.authorizationId, idempotencyKey: trial.key() })
trial.check(
  'The remainder can be voided after the fee was captured',
  released.ok,
  describe(released, (authorization) => `void accepted, status now ${authorization.status}`),
)
const afterRelease = await holds.captureFromHold({
  authorizationId: cleanReturn.authorizationId,
  amount: probe,
  finalCapture: true,
  idempotencyKey: trial.key(),
})
trial.check(
  'Nothing can be captured once the remainder is voided',
  !afterRelease.ok,
  describe(afterRelease, (capture) => `CAPTURED ${String(capture.amount.cents)} cents as ${capture.captureId}`),
)

await trial.finish()
