# Core real-service verification — 22 October 2026

Status: deployment and runtime preflight verified; rental scenarios await participant sign-in, test inbox details and sandbox payer approvals. The extension build gate is **not yet met**. No live clean-return, accepted-damage or contested-claim scenario has been declared successful.

## Scope and provenance

Exercise the existing application through booking, fee payment, hold authorization, photographed handover/return, comparison or explicit manual inspection, human claim approval/renter reply, verified settlement, immutable evidence publication and receipt delivery. PayPal means its real **sandbox**, not live funds. Live service connectivity is not an accuracy measurement.

Baseline source: `9cd59b05fcdef3eba4a5e0adfbc4dddb06ebd81b`. A focused, uncommitted photo-worker startup fix is being verified on `fix/photo-worker-startup`; no commits or pushes were authorized. The participant requested this verification on 22 October, resuming the earlier deployment deferral for this scope. The withheld accuracy gate set has not been read or used.

## Observed baseline and deployment repair

- Fresh `pnpm check` passed lint, type checks, 159 test files and 1,233 tests. These tests use local PostgreSQL/fakes or recorded responses; they do not prove live settlement.
- [CI for the source commit passed](https://github.com/rogerjeasy/hold/actions/runs/39497094923). [Its deployment failed](https://github.com/rogerjeasy/hold/actions/runs/39498179389).
- AWS confirmed `HoldWork` was `UPDATE_ROLLBACK_COMPLETE`, with `iam:PassRole` explicitly denied for `hold-comparison`. The comparison, evidence and receipt workers were absent. App Runner still ran `9772a5acf46f5bea7ab92c098de60d0ef7c2866a`.
- Reviewed and deployed the existing `HoldDelivery` template. AWS reported `UPDATE_COMPLETE` at 07:14:27 UTC on 22 October. The changes allow passing only the three additional named Hold worker roles, exact-version S3 reads and the configured Bedrock models; S3 KMS access is constrained to Hold's buckets. No product code or other project's resource was changed.
- The failed pipeline's migration step reported 21 migrations applied on 20 October, including a working `hold_worker` login. This is historical pipeline evidence, not a fresh migration-count query.
- Compared the failed CI's stored `HoldWork` and `HoldWeb` templates with a fresh local synthesis. Differences were limited to CDK analytics and native asset paths/hashes. Local native bundles contain Darwin ARM64 sharp binaries, so they are **not deployed to Linux Lambda**. The retry reuses the CI-produced Linux templates/assets and existing image.
- Prepared, reviewed and executed `core-verification-20261022-work`: no business-resource deletion or replacement. AWS confirmed `UPDATE_COMPLETE` and all eight workers exist.
- Invoked the deployed media, comparison, evidence and receipt handlers with empty SQS batches. Evidence and receipts returned `{"batchItemFailures":[]}`. Media and comparison failed during module initialization with `TypeError: Invalid URL`, from PDFKit's `./data/sRGB_IEC61966_2_1.icc` asset URL. An HTTP 200 from Lambda did **not** mean these two functions succeeded; `FunctionError` was `Unhandled`.
- Reproduced both failures with a new regression that bundles and starts the actual handlers as CommonJS. Both tests failed before the fix and passed afterward. A photo-only `@hold/evidence/photos` export removes eager PDF renderer initialization from those handlers while preserving the root package API. Independent review reported no actionable issues and separately passed both tests.
- Prepared fixed archives by replacing only the two JavaScript entries in the CI Linux bundles, retaining their `sharp-linux-x64` native dependencies. Archive SHA-256: media `504da61240feb63db4f3ffb2d050e0ade7f274fc847c7da7a278629be0c0a8ad`; comparison `ae9414129961c275b7499a2c0f2f84b1668a100f35051bec1650005ea57c17e5`. AWS's reviewed `core-verification-20261022-startup` change set modified only these two functions without replacement. `HoldWork` returned to `UPDATE_COMPLETE`; both functions reported Active/Successful and matching code hashes. Repeated live invocations returned HTTP 200, no `FunctionError` and `{"batchItemFailures":[]}`. The startup defect is resolved in the deployed Lambda code.
- A supplementary local Linux-container check could not start because Colima cannot bind-mount the host temporary directory. This was an environment limitation, not a successful runtime test. Live Lambda invocation remains the definitive runtime check.
- The reviewed web change set selected the tested baseline image and modified only the existing web service/policy beside CDK metadata. Execution followed all four live startup checks. AWS confirmed `HoldWeb` is `UPDATE_COMPLETE`, and App Runner is `RUNNING` on image `9cd59b05fcdef3eba4a5e0adfbc4dddb06ebd81b`.
- Each of the four handlers also processed a valid message for a nonexistent record in a newly generated random shop scope. All returned an empty failure list with no Lambda error, exercising the actual worker role, Secrets Manager database login, Data API transaction and scoped repository lookup. No rental, payment, photograph or receipt record was created. Media/comparison dead-letter queue counts were zero when checked.
- Fresh post-fix `pnpm check` passed lint, type checks and all 160 test files / 1,235 tests. `git diff --check` passed. No commit or push was made.

## Service observations

| Boundary | Observation | What remains unverified |
|---|---|---|
| Hosted app | `HoldWeb` update complete; App Runner running the CI-tested core image; anonymous sign-in page returned HTTP 200 | Authenticated scenario screens and actions |
| PayPal | Existing sandbox credentials accepted through Hold's real adapter | New rental fee, authorization, settlement, verified webhooks/read-back |
| Aurora | Real Data API connection as `hold_app`; unscoped queries returned zero shops and zero rentals | New scenario records and full scoped transactions |
| S3 | Evidence bucket has Object Lock enabled, GOVERNANCE retention of 180 days | New object checksums/retention, worker exact-version publication/download |
| Cognito | Native Chrome reached the live shop's real sign-in screen in a new task tab | Actual sign-in and passkey approval in this run |
| Lambda/SQS | Worker stack deployed; real cold starts and scoped Aurora lookups passed for media, comparison, evidence and receipt handlers after the fix | Each queue's full scenario processing; nonexistent-record probes do not render or settle anything |
| Bedrock/Rekognition | Existing adapters and intended worker permissions reviewed | Live photo/model processing; no accuracy claim |
| SMTP | Existing transport/configuration identified | Accepted settlement message and independently observed inbox receipt |

The public demo's bicycle before/after images have digitally drawn marks, as documented in `apps/web/public/images/CREDITS.md`. They are illustrative, not real damage evidence. No new camera capture or photo pair has been verified in this run.

## Scenario acceptance record

| Scenario | Real steps completed | Simulated steps | Pending |
|---|---|---|---|
| Clean return | None in this run | None executed | Booking/payment/hold, handover, return, inspection, staff release approval, PayPal confirmation, PDF/manifest, receipt |
| Accepted damage | None in this run | None executed | Booking/payment/hold, paired evidence, finding/manual reason, staff approval, renter code/acceptance, final capture/remainder, evidence and receipt |
| Contested claim | None in this run | None executed | Paired evidence, presented claim, renter code/contest, recorded owner decision, settlement, evidence and receipt |

For each completed rental, record its non-secret rental/claim/PayPal references, integer-cent amounts and currency, verified event/read-back, evidence version/fingerprints and delivery state. Keep sign-in codes, payer identity, secrets, signed links and raw payloads out of this document. Distinguish SMTP acceptance from actual inbox delivery.

## Inputs still needed

- A participant-designated test inbox for real sign-in and renter verification codes/receipts, and a sandbox personal account for the renter's PayPal approvals.
- A local path to project-owned before/after photographs for genuine photo verification, or an explicit decision to use illustrative samples with that limitation preserved.
- An authenticated browser session and the normal passkey approval where required. Do not bypass or fabricate either.

## Completion rule

Only mark the extension gate met after all three scenarios have observed verified settlement and evidence delivery through the deployed application. Preserve any simulated capture, deferred comparison, unreceived email or unexercised boundary explicitly. A passing local suite, successful deployment or provider connectivity check alone is insufficient.
