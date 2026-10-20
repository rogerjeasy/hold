# Return inspection implementation plan

**Goal:** Photograph returned items against their sealed handover baseline and show an evidence-backed comparison for staff review.

**Design:** `docs/architecture.md` sections 9.1, 10.2, 10.3 and 11.3–11.4. Reuse capture sessions, the immutable photograph store, comparisons and findings, the comparisons queue, and the shared server access wrapper. This change ends at inspection; claim approval and money execution follow in the spine.

**Constraints:** TypeScript; test first; no new service or table; no amounts from a model; no original photographs exposed to browsers; deny cross-shop and read-only writes; localized, responsive screens; manual review on uncertainty or model failure. Do not read or tune on the evaluation gate half. Do not commit.

## 1. Return evidence

- [x] Write and run failing repository tests for starting returns only after handover, preserving the handover photo plan and baseline, sealing once, and queuing one comparison per item only after all items return.
- [x] Extend capture sessions and add focused return/comparison repositories, keeping rental transitions in the domain state machine.
- [x] Verify missing views, overdue rentals, repeated requests and shop isolation.

## 2. Comparison

- [x] Write failing tests for quality/normalization/alignment/candidate regions and conservative outcome rules.
- [x] Add the comparison port, strict structured outputs, first and independent second looks, known-mark exclusion, and price-code lookup against the rental's agreed list.
- [x] Bound model calls and elapsed time. Persist model and prompt versions. A refusal, invalid response, poor alignment or mismatch defers to staff.
- [x] Test queue delivery against real PostgreSQL and recorded/fake model responses, including duplicate delivery and failures.
- [x] Wire the existing comparisons queue to the worker and its required least-privilege permissions.

## 3. Staff workflow

- [x] Write failing action and component tests for authorized staff starting, photographing and sealing a return, baseline overlay, three comparison outcomes and manual review.
- [x] Reuse photo capture/upload primitives; add return and comparison pages and the rental's return panel. Keep new marks out of the permanent known-mark baseline until settlement.
- [x] Add English, French, German and Spanish copy. Cover wrong shop, role, session kind and rental binding.
- [x] Add Playwright coverage using recorded photographs and the shared viewport helper.

## 4. Delivery

- [x] Update the matching architecture sections with implemented routes, processing and failure behavior.
- [x] Run focused tests, `pnpm check` and relevant browser tests; review the diff and report any external-service or evaluation limits.

## Verification — 20 October 2026

- `pnpm check`: passed; lint and type checking passed, 136 test files and 1,095 tests passed.
- `pnpm --filter @hold/web exec next build --webpack`: passed, including both new authenticated routes.
- `pnpm --filter @hold/web exec playwright test e2e/returns.spec.ts e2e/handover.spec.ts`: both passed against that production build. Return capture, comparison and saved manual review use the shared checks at every required width, including tablet landscape.
- Independent review found a missing outbox queue address/grant, mixed uncertainty in a second look, and untranslated known-mark coordinates. Each was reproduced with a failing regression test and fixed.
- `git diff --check`: passed. No commit or deployment was made.

The ordinary Turbopack browser-build path could not run in this environment because its internal port binding was denied; browser verification used the passing Webpack production build. Native OpenCV preparation was also executed from the bundled CommonJS worker format.

The current evaluation package contains only the existing bare two-photograph trial; a tuning-set runner and accuracy measurements remain open. No gate-half photographs were read or used. Live Bedrock responses, costs and real-world accuracy were not verified. Migration 0016, the comparison worker and the model permission boundary still need deployment; updating the delivery boundary requires the administrator path described in `tech-stack.md`. This feature ends at staff inspection. Claim approval and settlement remain the next part of the spine.

**Deferred by the participant on 20 October 2026:** Deployment and live AI accuracy evaluation will be done later. Continue the essential spine with claim approval and settlement; this deferral is not a claim that deployment or accuracy validation has passed.
