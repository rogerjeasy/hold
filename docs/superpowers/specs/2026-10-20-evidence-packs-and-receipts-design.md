# Evidence packs and settlement receipts

Status: approved by the participant on 20 October 2026 and implemented directly at their request, without a separate implementation plan. Integrated local checks passed; results are recorded below. Deployment and live AI evaluation remain deferred; no commits are authorized.

## Outcome and scope

Complete the next part of Hold's essential spine: a downloadable, versioned rental record, followed by automatic settlement receipts. The shop and renter must be able to see the evidence, the agreed prices, the human decisions and what PayPal has actually confirmed. This supports a credible hackathon demonstration without presenting simulated records as real transactions.

The participant requested paired photographs, findings, agreed prices, approvals, renter replies, verified capture/release/refund/invoice records, photograph fingerprints, immutable document versions and secure access with receipts linking to the record.

The existing design is in `docs/architecture.md` sections 9.2–9.5, 12.2–12.3, 13.2, 14.6–14.7 and 22.4. This work finishes spine functionality before any extension. Deployment and live model evaluation remain deferred as recorded in the previous settlement work. Existing uncommitted changes, including `apps/web/.env.example`, are preserved. No commits are authorized.

## Existing foundations

- `packages/evidence` provides private original-photo storage, display copies and signed links, but has no document renderer or document storage interface.
- Sealed capture sessions already store the exact manifest text, its SHA-256 and the previous manifest fingerprint. Photographs retain their original SHA-256 and server receipt time.
- `packages/db` already has `evidence_packs`, approvals, claim replies, agreed policy references, executions, invoices, an append-only money log and a transactional outbox.
- Settlement repositories only confirm capture, release, refund and invoice results after PayPal read-back. Pending executions and unsigned/unprocessed webhook bodies are not proof of payment.
- The evidence FIFO queue is defined in infrastructure, but has no evidence-pack consumer. The SMTP mailer and scoped renter-link checks already exist.

## Approach and alternatives

Recommended: generate PDFs on the worker from frozen database snapshots; retain the snapshot, manifest and PDF in the locked evidence bucket; publish a new immutable version; then deliver a receipt that names that version. This fits the current queues, storage and payment boundaries.

Generating a PDF during the download request would delay the counter and could produce different content for the same version. Browser-print generation would add a browser runtime to the worker. Neither is selected.

Proposed dependency: PDFKit, plus its TypeScript definitions if needed, within the evidence package. The existing stack has no PDF renderer. PDFKit provides image placement, text measurement, pagination and font embedding without a browser process. Use a redistributable embedded font covering the four supported languages, preserving its licence. Confirm the current official API before implementation. Python PDF tooling may inspect the resulting files locally; it is not a production runtime dependency.

Proposed schema addition requiring review under repository section 5: one `receipt_deliveries` table for durable delivery identity, leasing and retries. Reusing audit lines as mutable delivery state would undermine the append-only audit trail. No new package or dependency direction is proposed.

## 1. Rental snapshot and PDF contents

Read a consistent snapshot inside the rental's shop transaction. Freeze the source values used by the document; rendering must not re-query changing claim lines, names, policy text or findings. Every amount comes from stored integer cents and its currency.

Each document contains:

1. Shop, rental reference, rental period, item identifiers, document version, creation time and settlement status.
2. The agreed price-list and wear-policy versions and their contents, using the rental's saved references rather than the shop's current defaults.
3. Handover and return sessions, server receipt times, accessories and the renter's recorded condition confirmation. Missing confirmations are stated explicitly.
4. Findings grouped by item and view, with paired embedded display photographs and the finding region outlined. Known wear, uncertain findings, incomplete comparisons and simulated results are labelled. Model and prompt versions are included where recorded. No accuracy score is invented.
5. Claim lines and stored agreed prices, with the supporting finding or the named person's written reason. Include changes and the chronological approval history with actor, method and time.
6. Renter acceptance or contest, quoted comment and attached-photo references. An absent reply is described as absent; it is never described as consent.
7. PayPal authorization and verified capture, release, refund, invoice-sent and invoice-paid records, each with reference, currency, integer-cent amount and recorded time. Identify sandbox and simulated records visibly. Separate rental-fee capture from deposit settlement. Expiry is labelled as expiry, not as a verified release.
8. A photograph manifest listing original SHA-256, photo/session/item/view, server receipt time, supersession and sealed-session chain links. Also identify embedded display-copy hashes so an exported display image is not mistaken for the original.

Use face-blurred display copies in the ordinary pack. Do not expose original storage keys or original-photo download links. A missing display copy blocks publication and retries; no unblurred fallback. For an incomplete rental, explain which stages have not occurred and include only the available evidence.

The PDF uses readable section headings, repeating table headings, wrapping text and page numbers. Pair photographs at a fixed aspect ratio without distortion. Long names, comments, references, policy text and multi-page price lists must paginate without clipping. The interface and receipt use English, French, German and Spanish; document labels use the rental's saved language, which is recorded with the version.

## 2. Frozen versions, fingerprints and publication

Extend `evidence_packs` through a new migration with a frozen validated snapshot, its source fingerprint, manifest storage reference, document fingerprint, exact S3 version references, renderer version and a build status (`building`, `ready` or `failed`). Preserve the existing unique `(rental_id, version)` and evidence key constraints. Permit incomplete artifact metadata only before publication; a `ready` row must have all hashes and exact object-version references. A retry changes `failed` to `building`; `ready` has no outgoing transition.

The source fingerprint is SHA-256 over a canonical, ordered snapshot with an explicit schema version. Exclude the generation clock and random IDs from source identity. Include all document-visible source values and simulated flags. Identical source snapshots reuse their existing version. A changed source snapshot creates a new version. Allocate versions while holding the rental row lock, with a unique source identity per rental to fence concurrent requests.

Keep snapshot and version identity immutable from insertion. Permit the worker to fill artifact publication metadata once. After publication, refuse changes to any document metadata through database grants/guards, and grant neither service role delete rights. The web role may request builds and read versions but may not publish them.

Store the snapshot, photograph manifest and PDF under unique rental/version keys in the existing evidence bucket. Use conditional object creation and SHA-256 checksums. Record and read the exact S3 object version; Object Lock alone does not prevent a new object version under the same key. Do not grant retention bypass or deletion to the worker. Publish only after all artifacts and checksums are confirmed. A document cannot include its own full-file fingerprint; retain that fingerprint in publication metadata and expose it alongside the download.

Retry a failed build against the same frozen snapshot and reserved version. Reuse existing identical artifacts after a lost response; refuse conflicting bytes. A worker crash must leave a recoverable build, never a published partial pack. Build status and errors are separate from immutable published content.

Write evidence-build requests through the transactional outbox at sealed-session, condition-reply, completed/deferred-comparison, claim/approval/reply/resolution and verified-settlement changes. Freeze the relevant snapshot in the same transaction as the event, reserve the build row and enqueue its ID. Downloads remain reads. An explicit authenticated POST may request the current snapshot for older rentals without packs. Failed or delayed rendering never rolls back or repeats a payment operation.

## 3. Secure shop and renter access

Add a record page under the staff rental and implement the designed `/r/{token}/record` renter page. Both list available versions with creation time, status, manifest/PDF fingerprints and PDF/manifest download actions. Link them from the existing rental and claim screens.

Staff use the shared authentication/access wrapper and shop-scoped transaction. All four existing shop roles can read the shared rental record; no role can alter a published version. Renter reads use `renterAccess` with the existing `view` scope, signature, expiry, revocation, rate limit and exact rental binding. Read access does not grant acceptance, contest or payment permissions.

Authenticate every download and resolve its requested pack inside that caller's rental and shop before issuing an exact-version signed URL lasting at most the existing five-minute limit. Treat expired, revoked, wrong-scope and cross-rental requests as denials without leaking metadata. Responses are private/no-store; renter pages and endpoints use no-referrer and noindex protections. Never place a renter token in a PDF or manifest. Short-lived storage links remain bearer links until they expire.

Expose only the shared record: exclude provider credentials, raw webhook payloads, internal errors, private email addresses, private operational notes and future advocate limits. Include the staff identity required to explain a human decision. URLs and storage responses use controlled content types and safe attachment names.

Pages handle pending generation, no documents, failure/retry and ready states, with labelled controls, keyboard focus and translations. Run the shared responsive helper at every required width, including tablet landscape.

## 4. Automatic settlement receipts

Implement after evidence-pack generation and access are working.

Create a delivery intent in the same transaction that records a newly verified settlement event. Cover clean release, completed capture and confirmed remainder, completed refund, verified invoice sent and verified invoice paid. Group capture and its remainder into one receipt. Fee payment and routine authorization renewal do not generate these settlement receipts. An unresolved protective capture is labelled as a confirmed capture with the contest still open; it does not announce final rental closure. Invoice sent does not mean paid. Pending or failed operations do not generate success receipts.

Bind each receipt to its event identities and the pack version reserved from that committed settlement snapshot. Later evidence versions do not change an earlier receipt's target. Issue the receipt only once that exact pack is published. The signed renter link is read-only, scoped to that rental and expires under the documented renter-link policy; its record-page URL selects the exact version. Store only the token fingerprint in the database, and never log the URL. A delivery retry may issue a fresh link and revoke a superseded unused delivery link; no plaintext token is added to an outbox payload or stored document.

Send the renter a localized email at the verified payer contact, with the shop name, rental reference, event-specific amounts and references, timestamp and secure record link. The same receipt details and version are visible to staff on the authenticated rental record. Missing payer contact is a visible delivery failure for staff, without falling back to an unverified address. Do not attach the evidence PDF to email. Simulated demo deliveries stay in the existing memory mailer and are visibly identified.

`receipt_deliveries` has shop/rental/pack IDs, a unique event-bundle delivery key, recipient identity, language, status (`queued`, `sending`, `sent` or `failed`), lease expiry, attempt count, last typed error and sent time. A worker leases `queued`, retryable `failed` or expired `sending` work; only a successful mailer response permits `sent`, which has no outgoing transition. Add shop RLS and negative tests. Audit each delivery outcome without including tokens or unmasked contact data. The existing outbox and messages queue carry delivery IDs only.

Use a bounded lease to prevent concurrent workers sending one delivery simultaneously. Ordinary queue duplicates after a successful recorded send are no-ops. The current SMTP contract cannot guarantee exactly-once delivery if SMTP accepts a message and the worker crashes before recording success; document that possible duplicate and use a stable Message-ID if the transport supports it. Retry failures without rebuilding the pack or executing PayPal calls.

## 5. Package and infrastructure boundaries

- `packages/db`: snapshot query, version reservation/publication, receipt delivery repository, new migrations and RLS/grant tests. Keep source schemas at their validation boundary and derive types.
- `packages/evidence`: canonical manifest, renderer, document storage port/S3 and memory implementations, evidence-build orchestration and strict queue schemas. Separate document storage from photograph upload methods.
- `packages/notify`: localized settlement email templates and any stable Message-ID addition to the existing mailer.
- `packages/settle` and existing repositories: atomically request packs/receipts after verified changes; no new payment authority or amount inputs.
- `apps/worker`: evidence and messages queue handlers, dependency wiring, bounded retries and partial-batch failure handling.
- `apps/web`: wrapped read/build/download entry points, record screens, translations and shared route constants. Read the installed Next.js guides before changing routes.
- `infra`: wire consumers for the existing queues; grant only required exact-version reads, evidence-prefix writes, KMS access, database access, link-signing secret access and email configuration. The evidence renderer needs no PayPal credentials. Verify font/runtime assets in the bundled worker.

## 6. Acceptance and verification

Tests precede implementation, following red → green → refactor.

1. Snapshot tests prove agreed historical prices/policies, all approvals/replies, photo pairing, manifest chain membership and no private fields. Test clean returns, incomplete rentals, manual reasons, uncertainty, protective captures, waivers, refunds, unpaid/paid invoices and simulation.
2. Repository tests prove consistent snapshot creation, concurrent version allocation, unchanged-source reuse, changed-source version creation, cross-shop denial, one-time publication and refusal to update/delete published metadata using both service roles.
3. Storage/worker tests prove conditional writes, exact S3 version reads, checksums, no original-photo disclosure, missing display-copy retry, corrupted-byte rejection, duplicate delivery and recovery after crashes at each publication boundary.
4. Render representative PDFs, extract required text and render every page to images. Visually inspect paired photographs, overlays, long content, multilingual glyphs, prices, page breaks and footers. Include a large multi-item rental and a no-claim clean return. Use generated fixture images, never the evaluation gate half.
5. Receipt tests prove verified-event-only creation, capture/remainder grouping, no pending/failed success email, source-version binding, duplicate queue no-op, concurrent lease safety, transport-failure retry, missing-contact visibility and no token disclosure. Keep the SMTP crash ambiguity explicit.
6. Access tests cover wrong shop, wrong rental/version, absent role, expired/revoked/forged token, missing scope, rate limits and unknown input fields. Test that record links cannot accept/contest claims or initiate money movement.
7. Component and Playwright flows download PDF and manifest as staff and renter, verify earlier versions remain unchanged after a reply/refund, and check pending/error/retry states and all required viewports. Preserve existing handover, return and settlement flows.
8. Update architecture sections 6.3, 9.5, 12–15 and 16, the tech-stack evidence/dependency/delivery notes and the previous settlement boundary note. Run `pnpm check`, the production build, focused browser flows and `git diff --check`; report exact failures or any unavailable checks.

## Review decision

The participant approved the design, the PDF renderer dependency and `receipt_deliveries`, then explicitly requested direct implementation without an implementation plan. The sections above preserve the reviewed proposal; these decisions record the implemented refinements:

- PDFKit `0.20.2` and standard Helvetica render the four Western document languages without external font assets. Arbitrary non-Latin names/comments remain a font limitation. PDFKit/sharp are pinned external worker modules; Python/PyMuPDF is local inspection tooling only.
- Migrations `0018`–`0020` reserve packs initially as `building` and receipts as `queued`, forbid prefilled publication/delivery metadata, restrict publication/delivery updates to workers and preserve immutable published versions. Lifecycle transactions freeze source snapshots and reserve outbox work before rendering.
- Staff `/shop/rentals/{id}/record` and renter `/r/{token}/record?version={pack UUID}` pages read without mutation. Strict authenticated POST actions request builds and exact-version PDF/manifest links lasting at most 300 seconds. Read-only staff can download but cannot build; draft/awaiting-approval snapshots remain staff-only. Missing display copies block publication rather than exposing originals.
- Receipt links carry only `view` and expire 60 days after the later of rental end or issuance. The issuance date extends access for a late refund. Retries may leave multiple valid expiring read-only links; the proposal's optional revocation of an earlier unused delivery link was not adopted. Plaintext tokens are never stored in documents or outbox work.
- The worker and simulated web execution share the receipt state machine in `@hold/settle` through transport ports, with no new package dependency direction. Simulated emails remain in memory. The messages queue has six-minute visibility around a five-minute lease. Ordinary recorded-success duplicates are no-ops; SMTP acceptance followed by a crash can still produce a duplicate email.
- Dedicated evidence/receipt Lambda roles and the evidence/messages relay are wired. Deploy the updated `HoldDelivery` boundary before compute. AWS deployment, Linux native/font runtime execution and new live PayPal sandbox trials remain unverified; live AI evaluation remains deferred. Integrated local checks passed as recorded below.


## Verified on 20 October 2026

- `pnpm check`: lint, workspace typecheck and all 159 test files / 1,233 tests passed on the final implementation.
- `pnpm --filter @hold/web exec next build --webpack`: passed, including both record routes. The build required network access for the application's existing Google Fonts.
- Production Chromium: the record flow passed with photographed handover/return, a verified simulated clean release, a sent simulated receipt, identical staff/renter PDF and manifest downloads, and unchanged earlier-version PDF bytes. The final run passed in 17.7 seconds.
- Claim acceptance, clean release, handover and return browser regressions: four passed in 34.6 seconds. The record browser test ran separately with a fresh server, keeping public network rate limits unchanged.
- Record pages passed the shared responsive checks at 360, 390, 768, 820, 1024, 1180 (tablet landscape), 1280 and 1440 pixels. Staff and renter current and historical versions were checked. Mobile and desktop screenshots were visually inspected.
- PDF visual inspection covered all four document languages, a clean rental and a 13-page multi-item document with long policies, prices and replies. Fixed footer-created blank pages and repeated item identity beside photo pairs.
- Independent review found initial-state INSERT publication bypasses and a contradictory clean-release total. Regression tests now prove initial building/queued states, complete artifact metadata, immutable publication and correct release totals. Refund and invoice emails no longer invent a hold-release total.
- A recorded AWS Data API test reproduced JSONB expression fields arriving as strings. The snapshot query now decodes those fields before schema validation; the real Drizzle adapter is exercised against recorded SDK responses, alongside the PostgreSQL integration tests.
- Previous claim fixtures used UUIDs in place of photograph hashes. Those fixtures now contain valid SHA-256 strings; validation was retained.
- `git diff --check`: passed. No commits or deployment were made. Existing unrelated environment-example edits were preserved.

Remaining verification: apply the new migrations and IAM boundary/compute changes during the separately planned deployment; verify Object Lock, exact-version download permissions, the Linux Lambda font/native bundle, SMTP delivery and the PayPal sandbox end to end there. New live PayPal invoice/refund trials and live AI evaluation remain deferred. Local tests use fakes/recorded provider responses and generated photo fixtures; no gate-half evaluation data was used. SMTP still has the documented accepted-message/crash duplicate window, and PDFKit's standard fonts cover the four Western app languages rather than arbitrary non-Latin text.
