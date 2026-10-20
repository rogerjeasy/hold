# Claim approval and settlement implementation plan

**Goal:** Finish a return with an evidence-backed, human-approved claim or an explicitly confirmed clean release, with renter reply and verified PayPal settlement.

**Spec:** Existing approved product design in `docs/architecture.md` sections 7.1–7.6, 8.4, 11.3–11.5 and 22.4. The participant explicitly requested implementation on 20 October 2026. Deployment and live AI accuracy evaluation are deferred until later at their request.

**Architecture:** Reuse the existing claim, approval, reply, invoice, execution and outbox tables, domain arithmetic/state machines and PayPal port. All client inputs select stored prices or lines, never amounts. Staff writes use the shared wrapper; renter writes use signed scoped links plus an expiring single-use code sent to the PayPal payer email. Settlement runs only on the worker and trusts read-back resources. No new package, table or dependency direction; OTP metadata belongs to the existing renter link and ships in a new migration.

**Execution:** Native implementation in the current shared workspace, preserving the preceding uncommitted return feature. No commits, deployment, live model calls or evaluation-set access.

## Tasks

- [x] 1. Repository tests RED → GREEN: draft lines from the agreed list; evidence and named manual reasons; staff limits; cross-shop denial; clean release approval; atomic outbox and repeat requests. Implement focused claim/read/settlement repositories.
- [x] 2. Settlement integration tests RED → GREEN: clean void, accepted final capture and remainder, duplicate delivery, renewal at charge time, pending/failed responses and safe retry. Extend the existing worker and PayPal adapters only as required; verify amounts and resource binding before confirming.
- [x] 3. Renter tests RED → GREEN: signed claim-only link, payer-email code, expiry, attempts, single use, scope/rental binding, accept/contest and authorized independent owner/manager resolution. Add reply deadline processing through the existing worker queue.
- [x] 4. Staff/renter component and action tests RED → GREEN: select findings or manual reasons, preview price/capture/release, approve/present, clean release, contest/decision and settlement status. Four locales; shared viewport checks and recorded camera browser flow.
- [x] 5. Update architecture, threats and delivery notes; independent review, fix important findings with regression tests, run `pnpm check`, production build and relevant Playwright tests.

## Review focus

- Concurrent approval/reply/release requests must not create multiple executions or settle stale line selections.
- A queue redelivery after a lost PayPal response must reuse its stored request key and resource IDs.
- Uncertain/known/wear findings cannot silently become billable model lines; manual additions require a named reason.
- A valid link for another rental or code for an older challenge cannot approve a charge.
- Amount mismatch, partial/pending capture and an unconfirmed remainder must never be shown as settled.

## Progress

Context and existing design reviewed. Deferred deployment/evaluation recorded. Tests come before each implementation step.

Ruling: The lifecycle diagram and its old incoming-edge test omitted section 7.5’s pre-expiry capture exception. The diagram now lists `presented → charging`, guarded by the approved claim’s deterministic expiry deadline; the original reply period and refund path stay open. The old exact-edge test was corrected to this documented rule, rather than treating normal presentation as permission to charge.

Independent review: all eight important findings accepted. Regression tests cover actual presentation before the reply clock, protected excess/fallback timing, exact authorization fencing and unused late replacements, conflicting decisions during pending refunds, atomic follow-on outbox work, pending capture refusal, pending refund webhook recovery, and expired holds. Paired staff photographs were also added. The minor suggestion to filter every nonbillable finding out of the selector is deferred: server validation already rejects it, and this is a presentation improvement rather than a charging boundary. No second review pass is requested.

Recovery state-machine clarification: a failed protective charge can be waived and its unused authorization released; a release can resolve as expired only on a fresh PayPal read. Expired holds never move backwards into capturing or invoiced. Matching diagrams and tests describe these edges.

Boundary: automated settlement receipt emails and a downloadable evidence pack are subsequent spine work. Claim presentation is handed over as a private counter link with explicit renter review, and both sides can read the same settlement record there. New invoice/refund adapter paths use recorded responses and fakes; no live sandbox was contacted during implementation.

Pending refunds retain their refund ID and recover through GET /payments/refunds/{id}, not a second refund POST. The recorded-response adapter test and verified-event integration regression cover the binding. Amount-display regressions verify zero owed after a full protected waiver and the full invoice after expiry. Staff can uphold or waive a protected contest even while capture is pending/failed; the renter sees pending refund confirmation.

The combined late-replacement/excess-invoice regression also requires both the unused authorization's release and verified invoice payment before rental closure; releasing an unrelated authorization cannot bypass an open claim.

## Verification completed on 20 October 2026

- `pnpm check`: lint and typecheck passed; 145 test files and 1,139 tests passed on the final source.
- `pnpm --filter @hold/web exec next build --webpack`: passed on the final source. The Webpack build is used because this environment's Turbopack build cannot bind its internal port, as recorded in the preceding return feature.
- Playwright against that production build: claim acceptance, clean release, handover and return — 4 passed; rental regressions — 6 passed. The shared helper checked 360, 390, 768, 820, 1024, tablet landscape 1180, 1280 and 1440 widths for overflow, clipping and touch targets.
- The first combined 10-flow run passed 8 and failed 2 with “Too many tries from this network.” Browser renters all share one local network and the public limit is 60 requests/minute. Fresh servers for the two batches above passed all 10, without changing the production limit, assertions or retries. A future combined browser run still needs deliberate test-network isolation; it is not represented as a passing combined run.
- `git diff --check`: passed. No commits or deployment were made.

Deferred/remaining: deployment and live AI accuracy evaluation will be done later at the participant's request. New PayPal invoice/refund/renewal recovery paths were verified with strict recorded responses and the controllable fake, not a fresh live sandbox trial. Automatic settlement receipt emails and downloadable evidence packs remain later spine work. No accuracy claim was made and no gate-half images were read.
