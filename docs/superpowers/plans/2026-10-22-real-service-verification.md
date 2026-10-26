# Real-service core verification implementation plan

> **For agentic workers:** Use superpowers:executing-plans to carry out the existing core's verification task by task. No commits are authorized.

**Goal:** Demonstrate clean, damaged and contested rental returns through verified PayPal sandbox settlement and delivered immutable evidence, recording each real, simulated or unverified step.

**Architecture:** Exercise the existing hosted application and worker queues through their normal interfaces. Restore the existing deployment before testing; do not seed successful payment events or bypass human approval. Record provider observations rather than inferring success from local tests.

**Tech stack:** Existing Next.js application, Aurora Data API, Cognito, Lambda/SQS, S3 Object Lock, Bedrock/Rekognition, SMTP and PayPal sandbox.

**Spec:** `docs/architecture.md` sections 9.5, 11.3–11.5, 20.2–20.3 and 22.4; `docs/extensions.md` section 12.2. The participant requested this execution on 22 October 2026, superseding the earlier deferral for this verification scope. This is not the accuracy scorecard or a gate-half evaluation.

## Constraints

- Sandbox PayPal only; every charge retains the normal staff/renter approval and outbox path.
- No secret, sign-in code, signed renter URL, photo contents or unmasked personal details in the verification record.
- Existing `apps/web/.env.example` changes belong to the participant and are preserved.
- No changes to another project's AWS resources, no evidence deletion and no fabricated accuracy results.
- A provider accepting an email does not by itself prove inbox receipt. A sample photograph does not prove real camera capture.

## Review focus

- Deployed source/permissions drift: verify the image tag, worker presence and current migration count before scenarios.
- Verified settlement: confirm PayPal read-back/events and database records, not merely a redirect or successful HTTP response.
- Photo processing: identify sample/simulated input and manual deferral separately from successful live comparison.
- Evidence publication: verify exact version downloads, checksums and Object Lock under service permissions.
- Delivery: distinguish queued, SMTP accepted and inbox received, and retain explicit blockers when access is missing.

## Tasks

- [x] **1. Restore the existing deployment.** Read failed CI/deployment and CloudFormation events; review `HoldDelivery` diff; apply only the existing intended policy/template changes; deploy the current tested main commit. Verify stack states, image tag, migrations and worker health. If a code defect is found, reproduce it with a failing test before fixing it. The live worker database probes passed; the latest migration count of 21 comes from the pipeline log, explicitly labelled historical in the record.
- [ ] **2. Demonstrate three rentals.** Through normal authenticated interfaces, book/pay/authorize, seal handover and return photographs, inspect, approve/reply and settle clean, accepted-damage and contested claims. Record real provider references and the extent of manual/simulated input without secrets. Download staff/renter evidence and verify settlement receipts.
- [ ] **3. Record and check.** Maintain `docs/verification/2026-10-22-core-real-services.md` with per-service/per-scenario observations, failures and pending steps. Update the matching architecture/stack validation notes. Run `pnpm check` for any retained changes and appropriate regression tests for fixes. The extension gate remains unmet unless the observed end-to-end paths pass.

## Findings and progress

- AWS identity resolves to the configured account using the existing `wick-dev` profile.
- CI for `9cd59b05fcdef3eba4a5e0adfbc4dddb06ebd81b` passed. Its deployment failed; `HoldWork` is `UPDATE_ROLLBACK_COMPLETE`.
- App Runner runs `9772a5acf46f5bea7ab92c098de60d0ef7c2866a`, predating return inspection, claim settlement and rental records.
- CloudFormation reports an explicit `iam:PassRole` deny for `hold-comparison`. The source already includes the comparison/evidence/receipt roles in the allowlist. The administrative `HoldDelivery` stack must be reviewed and brought up to date before retrying resource deployment.
- The browser connector could not start because its browser profile is in use. No existing browser was closed or its session changed.
- Native Chrome access subsequently opened a separate task tab at the live shop, which correctly requires sign-in. No login or passkey was bypassed.
- `HoldDelivery` and the existing CI worker template deployed successfully. Empty-batch Lambda invocations exposed a PDFKit CommonJS initialization failure in the media and comparison workers; evidence and receipt workers started successfully.
- A failing startup regression reproduced both failures before the focused `@hold/evidence/photos` import fix. Both regression cases passed afterward; independent review found no actionable issues and independently passed them.
- Fresh post-fix `pnpm check` passed lint, type checks and 160 files / 1,235 tests. Both fixed workers then passed live startup and scoped Aurora probes with matching archive hashes. Web rollout completed; App Runner is running the tested core image. No commit or push was made.
- Ruling: retain CI's Linux native dependencies and replace only the two bundled JavaScript entries for this sandbox verification — local synthesis contains Darwin sharp binaries and cannot be deployed to Lambda. Source and artifact provenance are recorded in the verification record.
