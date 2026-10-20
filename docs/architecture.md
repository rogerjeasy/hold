# Hold: architecture

Architecture of the complete Hold application for the PayPal AI Hackathon 2026. Draft 2, 13 October 2026.

Read `project-description.md` for what Hold is and `tech-stack.md` for the tools. This document explains how the system is built: its parts, its data, how a PayPal hold is managed from start to finish, how evidence is kept, how the AI is contained, and how it runs on AWS.

Six additions built on top of the spine are specified in `extensions.md`. This document has been updated to match them. Where a section below mentions an extension, the detail is there.

**Contents**

1. Summary
2. What drives the architecture
3. System context
4. Services and stores
5. Code structure
6. Domain model
7. The hold core
8. PayPal integration
9. Evidence architecture
10. AI architecture
11. Key flows
12. Identity and access
13. Interfaces
14. Infrastructure on AWS
15. Security
16. Reliability and failure handling
17. Observability and audit
18. Performance and scale
19. Testing
20. Environments, deployment and demo mode
21. Decision record
22. Risks, assumptions and open questions
23. How certain each part is

---

## 1. Summary

Hold is a TypeScript system of two services, a web app on AWS App Runner and a worker, one PostgreSQL database on Aurora Serverless v2, an evidence store on S3, and a small set of managed AWS services. It talks to two outside systems: PayPal and Claude.

The architecture rests on eleven decisions. The last three come from the extensions.

1. **The deposit is its own PayPal authorization.** The hold is tracked as a separate object with its own life, apart from the rental fee. Everything PayPal documents about holds applies to it cleanly.
2. **PayPal's record is the truth.** A hold is placed, captured or released only when a verified PayPal event, or a direct read from PayPal, says so.
3. **Hold never trusts a hold to stay valid on its own.** Every hold has a schedule that watches its assurance period and its expiry, and acts before either lapses.
4. **Evidence cannot be altered.** Photographs are locked on write, fingerprinted, and chained to the item's earlier photographs.
5. **The AI gathers and compares. A person decides.** The comparison produces findings. Only a named person's approval turns findings into a charge.
6. **Prices come from the published list, never from the model.** The model may suggest which list entry applies. The amount is read from the database.
7. **Two independent looks before a damage finding stands.** A second, separate check must confirm each finding from close crops, or it is marked uncertain and sent to a person.
8. **Renters need no account.** A renter acts through a signed link bound to one rental. Their identity is their PayPal payment.
9. **A mandate is an approval given in advance.** A person may let an agent act for them inside written limits. Plain code checks every such action against those limits.
10. **Detect with code, explain with the model.** Anything that must not be missed is found by deterministic code. Agents investigate, draft and argue.
11. **One gateway for every agent.** The owner's assistant, the operations agent, a renter's outside assistant and the two advocates all reach Hold through the same checked and logged tools.

---

## 2. What drives the architecture

| Quality | What it means for Hold | How the architecture answers |
|---|---|---|
| **Correctness of money** | Never charge twice, never charge more than approved, never lose a hold | State machines, idempotency keys, webhook truth, hold upkeep, nightly reconciliation |
| **Fairness to the renter** | No charge without evidence, a published price and a person's approval | Findings tied to photographs, prices from the agreed list, approval records, a right to reply |
| **Credible evidence** | A photograph must stand up in a dispute | Locked storage, fingerprints, server timestamps, a chain per item |
| **Speed at the counter** | Handover and return in under a minute | Checks on the phone, direct uploads, comparison off the request path |
| **Honest uncertainty** | The system knows when it cannot tell | Confidence on every finding, an independent second look, deferral to a person |
| **Isolation** | One shop never sees another's data | Shop scoping in the service and row-level security in the database |
| **Demo reliability** | Judges can run it without a bike | Seeded shop, sample photo sets, reset script |

---

## 3. System context

```mermaid
flowchart TB
    owner["Owner<br/>laptop browser"]
    staff["Counter staff<br/>phone browser"]
    renter["Renter<br/>phone browser, signed link"]

    hold["Hold"]

    pp["PayPal sandbox<br/>REST APIs, webhooks, MCP server"]
    claude["Claude API<br/>vision and language"]
    rek["Amazon Rekognition<br/>face detection"]
    mail["SMTP account<br/>email"]

    owner --> hold
    staff --> hold
    renter --> hold

    hold --> pp
    pp --> hold
    hold --> claude
    hold --> rek
    hold --> mail
    mail --> renter
```

**People**

- **The owner** sets up items, prices and policies, approves larger claims and reviews the business.
- **Counter staff** hand items over, take them back and approve ordinary claims.
- **The renter** pays, accepts the hold, confirms condition, and accepts or contests a claim.

**Outside systems**

- **PayPal** reserves, captures and releases every dollar and reports every event.
- **Claude** compares photographs and writes language.
- **Rekognition** finds faces so they can be blurred.
- **An SMTP account** delivers codes, links and messages.

---

## 4. Services and stores

```mermaid
flowchart TB
    alb["App Runner public URL"]

    subgraph compute["One codebase, one image"]
        web["web<br/>Next.js UI, HTTP API,<br/>renter links, webhook intake"]
        worker["worker<br/>comparison, hold upkeep, PayPal events,<br/>executions, evidence packs, messages"]
    end

    subgraph data["Data and messaging"]
        db[("Aurora Serverless v2<br/>PostgreSQL")]
        s3e[("S3 evidence bucket<br/>Object Lock")]
        s3d[("S3 display bucket")]
        sqs["SQS queues"]
        sched["EventBridge Scheduler"]
    end

    cog["Cognito"]
    sec["Secrets Manager"]

    alb --> web
    web --> db
    web --> s3e
    web --> s3d
    web --> sqs
    web --> cog
    worker --> db
    worker --> s3e
    worker --> s3d
    sqs --> worker
    sched --> sqs
    web --> sec
    worker --> sec
```

| Part | Responsibility | Never does |
|---|---|---|
| **web** | Serves the app and renter links. Exposes the HTTP API and the MCP server for assistants. Issues upload links. Receives PayPal webhooks. Runs the owner's assistant. | Compare photographs or call PayPal to capture inside a request |
| **worker** | Compares photo sessions. Keeps holds valid. Verifies and applies PayPal events. Executes approved actions. Builds evidence packs. Sends messages. Runs the operations agent and negotiations. | Serve user requests |
| **Aurora** | Shops, items, rentals, holds, claims, approvals, PayPal events, audit log | |
| **S3 evidence bucket** | Original photographs and evidence packs, locked against change | |
| **S3 display bucket** | Smaller, face-blurred copies for screens | |
| **SQS** | Hands work from web to worker, with retries | |
| **EventBridge Scheduler** | Starts timed work, most importantly hold upkeep | |
| **Cognito** | Signs in owners and staff | |
| **Secrets Manager** | Holds every credential | |

**Why a separate worker.** Comparing a photo session takes seconds and uses memory. The counter screens must stay instant while that happens, and a failed comparison must be retried without the user doing anything. Capturing money must also continue if the web tier is busy.

---

## 5. Code structure

One repository with shared packages, built into one Docker image.

```
hold/
  apps/
    web/              Next.js app, HTTP API, renter links, webhook intake
    worker/           queue consumers and scheduled jobs
  packages/
    domain/           rental, hold and claim state machines, claim arithmetic,
                      approval rules, upkeep planning, mandates, proposals,
                      detectors, trust ladder, negotiation referee. Pure code.
    db/               schema, migrations, repositories, row-level security
    paypal/           PayPal adapter, webhook verification, event mapping
    settle/           running executions, applying verified PayPal events, the outbox relay
    evidence/         capture sessions, fingerprints, chain, evidence packs
    vision/           quality checks, alignment, candidate regions
    compare/          the comparison pipeline and its second look
    agent/            owner's assistant, tool gateway with tiers, number guard
    mcp/              Hold's MCP server for assistants, agent tokens, quotes
    ops/              operations agent, PayPal MCP client
    negotiate/        the two advocates' runners
    trust/            Clean Record, credential signing and checking
    auth/             token verification, shop authorization, renter links
    notify/           email and in-app messages
    config/           typed configuration and secrets loading
  infra/              AWS CDK stacks
  eval/               photo evaluation set and its runner
  docs/
```

**The dependency rule.** `domain` depends on nothing. It has no database, no network and no AI. Every other package may depend on `domain`. Apps depend on packages and never on each other.

**Ports and adapters.** PayPal, Claude, Rekognition and email are each reached through an interface defined beside the code that needs it. Tests use fakes.

**`vision` runs in two places.** The quality checks are the same code on the phone and on the worker, so a photograph the phone accepts is one the worker can use.

---

## 6. Domain model

### 6.1 Concepts

| Concept | Meaning |
|---|---|
| **Shop** | A rental business, with one or more locations |
| **Item type** | A kind of thing rented, with its hold amount and photo plan |
| **Item** | One physical thing, with its own history |
| **Photo plan** | The views that must be photographed for an item type |
| **Price list** | The shop's published prices for damage, loss and lateness. Versioned. |
| **Wear policy** | What the shop counts as ordinary wear. Versioned. |
| **Rental** | One renter taking one or more items for a period |
| **Renter** | A person identified by their PayPal payment |
| **Hold** | Money reserved on the renter's PayPal account for one rental |
| **Authorization** | One PayPal authorization backing a hold. A hold may have several over time. |
| **Capture session** | One guided set of photographs: at handover, at return, at unboxing |
| **Photo** | One locked photograph of one view |
| **Mark** | A known imperfection on an item, with the date it was first seen |
| **Comparison** | The result of comparing a return session with its handover session |
| **Finding** | One difference: where, what kind, how confident |
| **Claim** | The shop's itemized request to charge the hold |
| **Approval** | One person's recorded decision, with what they changed |
| **Execution** | One attempt to carry out an approved action through PayPal |
| **Evidence pack** | The complete record of a rental's condition and money, as one document |
| **Mandate** | A person's written permission for an agent to act within limits |
| **Proposal** | An action an agent suggests, waiting for a person to decide |
| **Exception** | Something a detector found that needs attention |
| **Clean Record** | A renter's count of rentals returned in good condition |
| **Trust ladder** | A shop's published rule for lowering a hold. Versioned. |
| **Quote** | A priced offer of a rental, referred to by its ID |
| **Agent session** | An outside assistant's access to one rental |
| **Negotiation** | Two advocates' exchange of offers on a contested claim |
| **Incident** | Something a renter reported during a rental |

### 6.2 Entity relationships

```mermaid
erDiagram
    SHOP ||--o{ LOCATION : "has"
    SHOP ||--o{ STAFF_ROLE : "employs"
    USER ||--o{ STAFF_ROLE : "holds"
    SHOP ||--o{ ITEM_TYPE : "offers"
    ITEM_TYPE ||--o{ ITEM : "includes"
    ITEM_TYPE ||--|| PHOTO_PLAN : "uses"
    SHOP ||--o{ PRICE_LIST : "publishes"
    PRICE_LIST ||--|{ PRICE_ENTRY : "contains"
    SHOP ||--o{ RENTAL : "takes"
    RENTER ||--o{ RENTAL : "makes"
    RENTAL ||--|{ RENTAL_ITEM : "covers"
    ITEM ||--o{ RENTAL_ITEM : "appears in"
    RENTAL ||--o| HOLD : "protected by"
    HOLD ||--|{ AUTHORIZATION : "backed by"
    RENTAL_ITEM ||--o{ CAPTURE_SESSION : "photographed in"
    CAPTURE_SESSION ||--|{ PHOTO : "contains"
    ITEM ||--o{ MARK : "carries"
    RENTAL_ITEM ||--o| COMPARISON : "assessed by"
    COMPARISON ||--o{ FINDING : "produces"
    RENTAL ||--o| CLAIM : "may raise"
    CLAIM ||--o{ CLAIM_LINE : "lists"
    FINDING ||--o| CLAIM_LINE : "supports"
    PRICE_ENTRY ||--o{ CLAIM_LINE : "prices"
    CLAIM ||--o{ APPROVAL : "needs"
    HOLD ||--o{ EXECUTION : "acted on by"
    EXECUTION ||--o{ PAYPAL_EVENT : "confirmed by"
    RENTAL ||--o| EVIDENCE_PACK : "documented by"
```

### 6.3 Tables

Every table except `users` and `renters` carries a `shop_id`.

| Table | Key contents |
|---|---|
| `users` | Cognito subject, contact details, language |
| `shops` | Name, address for renters (`slug`), timezone, currency, approval thresholds, reply period |
| `locations` | Address, opening hours |
| `staff_roles` | User, shop, role, approval limit |
| `paypal_accounts` | Shop, merchant ID, credential reference, webhook ID, mode |
| `item_types` | Name, kind, value to replace, hold amount, day rate, kit, photo plan, whether it is a sample |
| `items` | Type, label, size, serial, status with its note and date, chain head fingerprint, whether it is a sample |
| `photo_plans` | Ordered views with keys, labels, outlines and whether each is required. Never changed once saved. |
| `price_lists` | Version, effective date, published text |
| `price_entries` | Code, description, amount, category |
| `wear_policies` | Version, rules |
| `renters` | PayPal payer ID, email, name, language |
| `rentals` | Renter, period, fee, agreed hold, agreed price list and wear policy versions, state, the contact staff booked for and the renter's language, whether it was booked by staff or on the shop's page, whether it is a simulated sample |
| `rental_items` | Rental, item, the day rate and hold agreed for it at booking, accessories out, accessories back |
| `holds` | Rental, reserved amount, placement strategy, state, current authorization |
| `authorizations` | Hold, PayPal authorization ID, amount, created, assured until, valid until, state |
| `capture_sessions` | Rental item, kind, the photo plan used, actor, started, completed, manifest fingerprint |
| `photos` | Session, view, evidence key, display key, fingerprint, received time, quality scores |
| `marks` | Item, view, region, description, first seen session, status |
| `comparisons` | Handover session, return session, alignment scores, state, model and version used |
| `findings` | Comparison, view, region, class, confidence, description, matched mark, suggested price entry |
| `claims` | Rental, total, state, presented at, reply due |
| `claim_lines` | Claim, finding, price entry, amount, source |
| `claim_replies` | Claim, renter decision, comment, added photos |
| `approvals` | Subject, staff member, decision, changes made, method |
| `executions` | Rental, hold (absent for the fee), action, idempotency key, amount, PayPal resource IDs, state, attempts |
| `paypal_events` | PayPal event ID, type, raw body, headers, verification state, processing state |
| `money_events` | Rental, kind, amount, PayPal reference, time. Append-only. |
| `invoices` | Rental, PayPal invoice ID, amount, state |
| `shipments` | Rental, direction, carrier, tracking number, status |
| `disputes` | Rental, PayPal dispute ID, reason, state, evidence sent |
| `evidence_packs` | Rental, version, evidence key, manifest fingerprint |
| `renter_links` | Rental, token fingerprint, scope, expiry, last used |
| `outbox` | Pending messages written in the same transaction as state changes |
| `audit_log` | Who did what, when, from where |

**What the migrations hold so far.** Every table above, with `rentals.simulated` added in `0009`, the item columns in `0010` and the booking columns in `0011`, except `locations`, `shipments` and `disputes`, which arrive with the features that use them. The schema is in `packages/db/src/schema`, the migrations in `packages/db/migrations`.

**Tables added by the extensions.** `mandates`, `proposals`, `exceptions`, `ops_runs`, `eval_runs`, `finding_outcomes`, `rental_outcomes`, `trust_ladders`, `trust_rungs`, `renter_consents`, `quotes`, `agent_sessions`, `negotiations`, `negotiation_moves` and `incidents`. Their contents are listed in `extensions.md` section 4.6.


### 6.4 Items, their kit and their photo plan

The rules are plain code in `packages/domain` (`item-type.ts`, `item.ts`, `photo-plan.ts`). The tables are written by `packages/db/src/item-repository.ts`, and the pages are in section 13.6.

- **An item type** has a name, a kind, the value to replace one item, the hold while one is out, the fee for one day and a kit. The kind is one of `bike`, `e_bike`, `scooter`, `water`, `snow`, `camera`, `camping`, `event`, `tool` and `other`. The kit is up to ten things, such as a charger or a lock, each with a count. They are handed over with each item and counted back at the return. All three amounts are in the shop's currency, so a type can be made only after the first price list is published. The hold is never more than the value. A shop's own type names are unique, whatever their case.
- **The day rate** is what a rental's fee is worked out from at booking. The fee is then kept on the rental, so a later change to the rate changes no booking.
- **A photo plan** is one to twelve views, at least one of them required. Each view has a label, a framing outline (`whole_side`, `front`, `rear`, `top` or `detail`) and a key made from its label. Photographs are filed under that key. Each kind has a suggested plan that the shop adjusts; the e-bike's is the six views the guided handover shows. **A plan is never changed once saved.** An edit to a type's views saves a new plan and points the type at it. Each capture session records the plan it was taken with, so a return is always compared view by view with its handover. The service roles may not update `photo_plans` at all.
- **An item** is named after its type and numbered on from the highest number in use, as in "City e-bike 5". It has an optional size and serial number, and a label unique within the shop.
- **An item's status** is what the shop says about it: `in_service`, `in_repair` or `retired`, with a note and the date it changed. A retired item never comes back. An item a renter has cannot go to repair, and an item a booking, hold or comparison still needs cannot be retired.
- **Where an item stands** is not stored. It is read from its status and the rental that binds it (`bindingRental`): `available`, `booked`, `out`, `overdue`, `checking` (returned, being compared), `in_repair` or `retired`.
- **Who may change what.** The owner or a manager creates and edits types, with a passkey where their role needs one, because the amounts are what renters are held and charged. They also add and rename items, which needs no passkey. Counter staff may send an item to repair and back, since they see a flat tyre first. Only the owner or a manager may retire an item. Read-only members see everything and change nothing.
- **Sample types and items** made for a demonstration (section 20.3) are marked `simulated`, stand apart from the unique names, and cannot be changed.

### 6.5 Bookings and the fee

The rules are plain code in `packages/domain/src/booking.ts`. The tables are written by `booking-repository.ts`, `renter-repository.ts` and `fee-repository.ts` in `packages/db`.

- **Two ways to book, one booking.** Staff book at the counter or on the phone (`/shop/rentals/new`), with an optional contact name and email. A renter books themselves on the shop's own page (`/s/{slug}`), with nobody signed in. Both choose a period on the shop's clock and a count of each item type, and both end at the renter's link, where the fee is paid. `rentals.booked_through` records which.
- **The amounts come from the item types.** The fee is each item's day rate times the days, where each started 24 hours is a day and a rental is at least one. The hold is the sum of each item's hold. Both are stored on the rental, and each item's agreed day rate and hold on its `rental_items` row, so a later change to a type changes no booking. No form sends an amount.
- **Limits.** A rental lasts at most 28 days, so the hold placed at pickup outlives it, its return and a claim's reply. It may start up to 15 minutes in the past, for a renter at the counter, and up to a year ahead. Up to ten kinds of item, ten of each.
- **Which items.** The booking takes specific items, the first free ones of each type by label. An item is free for a period unless it is in repair or retired, or a rental that still needs it overlaps the period. An unpaid booking keeps its items for 15 minutes (`PENDING_PAYMENT_MINUTES`). An item out, or back and being checked, is kept until now at least; an overdue one until it comes back. The candidate items are locked while the booking is written, so two bookings made at once cannot take the same item.
- **The renter's link.** Each booking issues a link with the scopes `view` and `pay` (section 12.3). Staff can show a new link as a QR code at any time, or email it to the contact. Each showing makes a new link, since only fingerprints are kept.
- **Paying the fee.** The renter's link page shows what they rent, the fee and the hold apart, the price list and wear policy they agree to, and the reply period. Paying creates an order with intent to capture in the shop's own PayPal account, for the stored fee, and sends the renter to PayPal. An order already awaiting approval is reused. PayPal sends the renter back to `/r/{token}/paid`, which changes nothing on arrival and confirms by a POST: the order is read back and must be approved and must be the one this rental started; then the execution is recorded and handed to the worker, which captures the order with its key and reads it back. Only that read-back books the rental (section 7.6). A renter who approves and never comes back is booked from PayPal's `CHECKOUT.ORDER.APPROVED` event (section 8.5).
- **After the time to pay.** A booking past its 15 minutes no longer keeps its items, but its renter may still pay while nobody else has taken them. Staff can let an unpaid booking go (`abandoned`). A paid booking is not cancelled here, since that would need its fee refunded.
- **Who the renter is.** The payer PayPal names on the capture, through `hold_renter_for_payer`. Until then a rental shows the contact staff typed, or "not paid yet".

### 6.6 The hold at pickup

The rules are plain code in `packages/domain/src/hold-placement.ts`. The tables are written by `hold-repository.ts` and `hold-upkeep-repository.ts` in `packages/db`; the PayPal calls are made by `packages/settle`.

- **Staff ask for it.** On the rental's page, the "Hold at pickup" panel asks for the hold once the fee is paid (`askForHold`, any staff member). This writes the hold, `requested` and `at_counter`, for the hold agreed at booking, moves the rental to `awaiting_hold`, and shows a new renter link to `/r/{token}/pay` as a QR code. Asking again shows a new code for the same hold. Requesting moves no money.
- **The renter approves it on their own phone.** `/r/{token}/pay` says what the hold is, that it is not a charge, and sends the renter to PayPal for an order with intent to authorize, for the stored amount, worded by `holdOrderDescription` in their language. An order still waiting for approval is reused. PayPal sends them back to the same page, which changes nothing on arrival and confirms by a POST: the order is read back, must be approved and must be the one the hold waits on; then the authorization is recorded as an execution and handed to the worker (section 7.6).
- **Placed only on PayPal's word.** The worker authorizes the order with the execution's key and reads the authorization back. The hold is placed only for a `created` authorization for exactly the agreed amount and currency; a pending one waits for the event, and any other amount fails the execution. Placing records both clocks from PayPal (section 7.4), logs `hold_placed` once, moves the rental to `ready`, and schedules the hold's upkeep. A renter who approves and never comes back is placed from PayPal's `CHECKOUT.ORDER.APPROVED` event, and a reply lost on the way from `PAYMENT.AUTHORIZATION.CREATED` (section 8.5).
- **A declined funding source** fails the execution with `declined`. The hold stays `requested`, the rental `awaiting_hold`, and both the renter's page and the staff panel say plainly that nothing was reserved. The renter approves again, which makes a new order with a new key.
- **The staff panel looks again by itself** every three seconds while it waits, and shows the placed hold with the day to charge by and the day it ends.

### 6.7 The guided handover

The rules are plain code in `packages/domain/src/capture-session.ts`. The tables are written by `capture-repository.ts` in `packages/db`; photographs are stored by `packages/evidence`, and display copies made by `packages/vision`.

- **Staff photograph each item.** Once the hold is placed, the rental's "Handover" panel starts a session per item (`/shop/rentals/{id}/handover/{session}`), on the plan its type has now. The screen walks the plan's views; each shows the rear camera with the view's framing outline, a file to choose when there is no camera, and, for a demonstration, a sample photograph said to be one.
- **The phone checks each photograph before it uploads.** OpenCV.js, in a Web Worker, measures sharpness (the variance of the Laplacian), shadows and highlights (the grey levels the darkest and brightest 5% lie beyond, so an item lit against a black or white backdrop passes) and how much of the frame the item's edges fill. `checkPhotoQuality` decides: a blurred, too dark, washed-out or nearly empty photograph is retaken, with the reason, before anything uploads.
- **Straight to the locked bucket, fingerprinted twice.** The phone computes the SHA-256 and asks for a five-minute signed PUT under `{shop}/{session}/{view}/{random}.jpg`; the checksum is signed, so S3 refuses any other file. The server then reads back the SHA-256 S3 computed and records that, at the server's time. A retake takes the view's place and marks the earlier photograph superseded; the earlier one stays locked and on record. The service roles may change only a photograph's display copy, perceptual fingerprint and retake mark, never its fingerprint or original.
- **Marks.** Each view shows the item's known open marks from sealed sessions; staff confirm those still there, and box new ones on the photograph (dragged, or moved and sized with the arrow keys) with a description. A new mark is on the item from then on (section 9.4).
- **Sealing** needs every required view. The manifest (`manifestText`) lists each photograph's view, fingerprint and time and names the item's previous manifest; its SHA-256 becomes the item's chain head. When every item of the rental is sealed, the rental is `out`.
- **The condition report.** Sealing the last item issues a link with the scopes `view` and `confirm_condition` to `/r/{token}/condition`, emailed to the contact and shown to staff as a code. For 24 hours (`CONDITION_REPLY_HOURS`) the renter confirms it, or adds photographs of anything missed into a `condition` session of their own, sealed and chained like any other, and the rental records the answer. Any link to the rental may look; only that one may answer.
- **Display copies.** Each recorded photograph is sent to the `media` queue as soon as it is committed (the outbox is the fallback). The worker reads the original, shrinks it to 1,600 pixels, finds faces with Rekognition on the small copy, blurs them, strips all metadata, writes the copy to the display bucket and records it with a 64-bit perceptual fingerprint. Screens show display copies through five-minute signed links.
---

## 7. The hold core

This is the part of Hold that must never be wrong. It lives in `packages/domain` and is plain, deterministic code.

### 7.1 Three linked state machines

A rental, its hold and its claim each move through explicit states. A change that is not listed cannot happen.

**Rental**

```mermaid
stateDiagram-v2
    [*] --> pending_payment
    pending_payment --> booked
    pending_payment --> abandoned
    booked --> awaiting_hold
    awaiting_hold --> ready
    booked --> cancelled
    awaiting_hold --> cancelled
    ready --> out
    ready --> cancelled
    out --> overdue
    out --> returned
    overdue --> returned
    returned --> inspecting
    inspecting --> settling
    settling --> closed
    cancelled --> [*]
    abandoned --> [*]
    closed --> [*]
```

- **pending_payment:** a booking exists and its fee is not yet paid. It keeps its item for fifteen minutes.
- **abandoned:** the fee was never paid and the item was freed.

**Hold**

```mermaid
stateDiagram-v2
    [*] --> requested
    requested --> placed
    requested --> declined
    placed --> renewing
    renewing --> placed
    renewing --> at_risk
    at_risk --> placed
    placed --> releasing
    at_risk --> releasing
    releasing --> released
    releasing --> expired: PayPal confirms expiry
    capture_failed --> releasing: claim waived
    placed --> capturing
    at_risk --> capturing
    capturing --> captured
    capturing --> capture_failed
    capture_failed --> capturing
    capture_failed --> invoiced
    placed --> expired
    at_risk --> expired
    released --> [*]
    captured --> [*]
    invoiced --> [*]
    expired --> [*]
    declined --> [*]
```

- **placed:** PayPal confirms the money is reserved.
- **at_risk:** the hold exists but its assured period has passed and a renewal did not succeed. The owner is told.
- **captured:** the approved amount was taken. Any remainder is released in the same step.
- **invoiced:** capture was not possible, so the claim was sent as an invoice.
- **expired:** the hold reached the end of its life without being used or replaced.

**Claim**

```mermaid
stateDiagram-v2
    [*] --> draft
    draft --> awaiting_approval
    draft --> waived
    awaiting_approval --> approved
    awaiting_approval --> waived
    approved --> presented
    presented --> accepted
    presented --> contested
    presented --> lapsed
    presented --> charging: approved, hold near expiry
    contested --> negotiating
    contested --> decided
    negotiating --> agreed
    negotiating --> escalated
    agreed --> charging
    agreed --> escalated
    escalated --> decided
    accepted --> charging
    lapsed --> charging
    decided --> charging
    decided --> waived
    charging --> charged
    charging --> charge_failed
    charge_failed --> charging
    charge_failed --> waived: protected claim waived
    charged --> adjusted
    charged --> closed
    adjusted --> closed
    waived --> closed
    closed --> [*]
```

- **lapsed:** the renter's reply period ended without a reply.
- **adjusted:** part of a charge was refunded after review.
- **negotiating:** both sides gave an advocate limits, and the advocates are exchanging offers.
- **agreed:** the advocates agreed. Each person confirms, unless their mandate waives it.
- **escalated:** the advocates did not agree, or a person declined the result. The owner decides. A claim never returns to `contested`.

**How they connect.** A rental cannot be handed over unless its hold is placed. A hold cannot be captured unless a claim reached charging. A rental cannot close while its hold is in any state but released, captured, invoiced or expired.

### 7.2 Claim arithmetic

- **Each line is priced from the price list version the renter agreed to at booking.** A later price change never affects an earlier rental.
- **The line amount is read from the database.** The model may suggest which entry applies. It cannot supply an amount.
- **The claim total is the sum of its lines.**
- **The charge is the smaller of the claim total and the reserved amount.**
- **Anything above the reserved amount** becomes a separate invoice with the same evidence.
- **Amounts are integer cents** with a currency code.

Hold deliberately does not use PayPal's allowance to capture slightly more than was authorized. The renter agreed to a stated hold, and Hold never takes more than that from it.

### 7.3 Approval rules

Before any action on a hold, the approval rules decide who must confirm it.

| Action | Who may confirm |
|---|---|
| Release a hold after a clean return | Any staff member |
| Approve a claim up to the shop's staff limit | Any staff member with that limit |
| Approve a claim above the staff limit | The owner or a manager |
| Reduce or waive a claim | The owner, a manager, or the staff member who raised it |
| Decide a contested claim | The owner or a manager, and not the person who raised it where the shop has more than one |
| Refund part of a charge | The owner or a manager |
| Move a booking that has not started to another item of the same type | Any staff member |

**Rules that always hold**

- A claim cannot be approved unless every line has a finding with photographs, or was added by a named person with a written reason.
- A claim cannot be charged before the renter has been shown it, unless the hold is about to lapse. Section 7.5 covers that case.
- Every approval records what the person changed, such as a removed line or a reduced amount.

**Approval in advance**

A person may also approve earlier, by granting a mandate. A mandate has a fixed kind, typed limits and an end date, and can be revoked. Plain code checks each action against it, and the approval record names it.

| Mandate | Granted by | Allows |
|---|---|---|
| Standing rule | The owner | The operations agent to release a hold after a clean comparison that nobody confirmed |
| Settlement, shop side | The owner | The shop's advocate to agree a contested claim, down to a stated share |
| Settlement, renter side | The renter | The renter's advocate to agree a contested claim, up to a stated total |
| Hold by assistant | A renter with a saved method | The renter's own assistant to accept a hold, up to a stated amount. Optional. |

No mandate allows a charge that a claim does not already justify. The rules above still apply to every claim.

### 7.4 Hold upkeep

A PayPal hold has two clocks.

- **Assured period:** three days from placement. Capture is best assured inside it.
- **Validity:** 29 days from placement. After that the hold is gone.

A hold can be renewed once, after the assured period and before validity ends. The renewal gives a new authorization identifier and a new three-day assured period. It does not extend the 29 days.

**Hold renews only at the moment it charges.** The sandbox said on 14 October 2026 that a hold may be renewed only once. A renewal made earlier is a guess about when a charge will come. If the return is late, or the renter takes the reply period, the charge falls outside the renewal's three days and the one renewal is already spent. So when a charge is due after the assured period, Hold renews and captures on the new identifier straight away, inside its fresh assured period. Every charge within the 29 days is then assured, whatever the return date and however long the reply period. A clean return, the common case, is never renewed at all. Decision 4 in section 21 records the alternatives.

The plan is computed by plain code in `packages/domain/src/upkeep.ts` from the authorization's clocks. Each timed step is a schedule in EventBridge. None of them renews.

| When | What Hold does |
|---|---|
| **The hold is placed** | Records both clocks from PayPal's reply and creates the schedules below |
| **A charge is due,** inside the assured period | Captures on the current identifier |
| **A charge is due,** after the assured period, on a hold not yet renewed | Renews, reads the new authorization back, then captures on it at once |
| **A charge is due,** and the renewal is already spent | Captures on the current identifier, without assurance |
| **A renewal fails** | Marks the hold at risk, tells the owner, and still tries the capture on the original identifier |
| **A capture is refused** | Sends the claim as an invoice with the evidence pack and releases the hold (section 8.4) |
| **Three days before validity ends,** and the rental is still open | Starts a replacement: a new hold through a saved payment method if one exists, otherwise a link asking the renter to approve a new hold. The replacement has its own clocks and its own renewal. |
| **A replacement is confirmed** | Releases the old hold |
| **A day before validity ends,** with an approved claim still waiting for the renter's reply | Charges it then, as section 7.5 says |
| **Validity ends with no replacement** | Marks the hold expired and tells the owner at once |
| **The rental ends** | Removes any schedules still pending |

**What Hold gives up.** A renewal also re-checks the renter's funds, so renewing early would warn sooner that the money is gone. Hold accepts the later warning: the failure is handled at the charge in the same way, with a capture attempt and then an invoice, and the one renewal is never wasted on a rental that comes back clean. While a claim is being prepared, the claim screen reads the authorization from PayPal to show that the hold still stands, which spends nothing.

**Hold tracks expiry itself.** PayPal's event list has no event for a hold expiring, so Hold does not wait to be told. It acts on its own clock and confirms by reading the authorization from PayPal.

**As built** (`packages/settle/src/upkeep.ts`, `upkeep-schedules.ts`):

- **Two one-off schedules per authorization,** `hold-replace-{authorization}` three days before the end and `hold-expire-{authorization}` at the end, in the `hold-schedules` group of EventBridge Scheduler. Each sends a message to the `upkeep` queue, grouped by the hold, and is deleted after it fires. A step whose time has already passed is sent to the queue at once, since a schedule in the past never fires. If making them fails after PayPal placed the hold, the execution is tried again and `ensureUpkeep` makes them then.
- **A step acts only on the authorization the hold rests on.** One made for an authorization a replacement took over from does nothing.
- **Expiry** reads the authorization back. If PayPal still holds the money until a later time, the step moves to that time. Otherwise the hold and its authorization are marked `expired`, the audit trail says so, and every owner is emailed in their language with a link to the rental. A failed email is tried again without expiring twice.
- **Replacement,** while the rental still needs its hold (`needsReplacement`: from `ready` until `settling`): the worker makes a new hold order for the same amount, keyed by the authorization it replaces, keeps it on the hold, signs a new renter link to `/r/{token}/pay` and emails it to the renter, in the rental's language, with the day the old hold ends. Once the renter approves, the hold moves onto the new authorization (`replaces_id` names the old one), its own clocks and schedules replace the old ones, and the old authorization is voided through a `release` execution, confirmed by reading it back, with `hold_released` in the money log. A renter who never approves is left to expiry. Placing a replacement through a saved payment method waits for PayPal to allow it (tech-stack.md section 16).
- **The rental ends:** a step for a hold no longer `placed` or `at_risk` does nothing, so no schedule outlives its use. Removing them when the rental closes comes with closing.

### 7.5 The reply period and the hold's life

A shop may give the renter time to reply to a claim. That period cannot outlast the hold.

- If the reply period ends inside the hold's validity, Hold waits.
- If the hold would lapse first, Hold captures the approved amount before it lapses and tells the renter that the claim is still open. If the claim is then reduced or waived, the difference is refunded.

This rule is shown to the renter at booking. The explicit `presented` → `charging` exception is allowed only by the deterministic deadline guard for an approved claim whose hold would otherwise outlast the reply period by less than one day. It preserves the original reply period: a protective capture is not a final decision on a later contest, and a human-approved waiver refunds the verified capture through its own execution.

**As built on 20 October 2026 — claim approval and settlement**

- `/shop/rentals/{rentalId}/claim` composes a claim from the rental's agreed price-list version. A selected finding must be non-simulated, second-look-confirmed new damage or a missing part with photographs from both sealed sessions. A manual line requires a named staff member and a written inspection reason. Neither input accepts an amount. The screen shows stored prices, paired signed display photographs and the capture/release/invoice split.
- Approval checks the person's role and approval limit, records the immutable line IDs and total, and creates a private, scoped renter link and QR. Approval alone neither starts the reply period nor permits capture. The renter sees `/r/{token}/claim` and explicitly posts “I have reviewed this claim”; that transaction records presentation and the original reply deadline. Reopening or reissuing a link does not reset it. A claim never reviewed stays approved for staff follow-up rather than silently charging.
- Accept/contest requires a fresh eight-digit code sent to the email returned by PayPal for the payer. Migration `0017` adds only challenge metadata to `renter_links`: a keyed digest, expiry and attempt count. The code is bound to the link, expires after ten minutes, has three attempts, is single-use, and cannot be resent inside sixty seconds. A booking/pay link cannot reply. The signed shared renter wrapper and shop RLS apply to every write; staff money decisions use the existing passkey step-up.
- A normal acceptance, elapsed reply period or eligible independent owner/manager decision queues one capture; a contest queues none. A staff-confirmed clean return or waiver queues one release. Approval, state changes, execution and outbox row commit together. Prices, approval bounds and final-capture amounts are rechecked before PayPal is called. No agent or model can approve or charge.
- The capture reserves the hold as `renewing` or `capturing` before any outside call. A renewal has its own execution; its new authorization ID replaces the capture's binding before capture starts. A late replacement authorization cannot replace one being settled: it gets a durable release job, and the rental cannot close while an extra created authorization remains or its claim is not closed (including an unpaid excess invoice). Confirmation checks the exact execution, authorization, final-capture flag, amount and currency. Pending capture/refund resource IDs are retained for verified webhook recovery and direct read-back.
- `claim_plan` and `claim_due` use the existing upkeep queue. The due time is the earlier of the reply deadline and one day before authorization expiry. A protective capture leaves the original reply period open. Excess/fallback invoices wait for acceptance, an eligible uphold decision, or the original deadline with no contest. A contested protected claim remains open. The human decision is fenced under the claim lock; a later conflicting decision cannot race a refund. Waiver refunds the verified captured amount, or releases the unused authorization after a failed capture. These recovery edges are `charge_failed → waived`, `capture_failed → releasing`, and `releasing → expired` only when a fresh PayPal read proves expiry; an already expired hold stays terminal.
- A refused capture, including a pending capture later read as declined/failed, uses the approved claim's full amount for an invoice; an expired authorization is never captured. An excess above the hold becomes a separate invoice. Capture confirmation and any next invoice/refund outbox obligation share one transaction. Invoices are searched by a stable invoice number before creation, then read/validated before and after sending. A verified `INVOICING.INVOICE.PAID` event triggers another direct read before recording payment and closing. A sent invoice keeps the claim/rental open; it is never counted as paid. Money events and approvals remain append-only.
- Staff and renter screens show settlement status in English, French, German and Spanish. The private link is handed to the renter at the counter; claim presentation is explicitly acknowledged there. A downloadable evidence pack and automatic settlement receipt emails are still subsequent spine work; the current claim pages contain the shared record and evidence. Deployment and live AI accuracy evaluation are deferred as recorded in section 20.2.

### 7.6 Execution, the outbox and idempotency

Acting on a hold involves a database and an outside API, which cannot share a transaction. Hold uses the outbox pattern.

1. In one database transaction, Hold records the approval, creates an execution with a fresh idempotency key, and writes an outbox row.
2. The worker reads the outbox and sends the message to the executions queue.
3. The worker calls PayPal with the idempotency key.
4. The worker records PayPal's reply and marks the execution submitted.
5. The execution is confirmed only when the matching PayPal event is verified, or the resource is read back from PayPal.

**The rental fee** follows the same steps with the action `fee_capture`, which names the rental and no hold. The renter's request records the execution with its outbox message and sends it to the `executions` queue at once (`requestFeeCapture` in `packages/settle`); the worker calls PayPal with the execution's key and records the read-back (`runExecution`). If the send fails, the outbox relay sends it within a minute. The renter's page looks again every two seconds until the rental shows as booked.

**The outbox relay** runs every minute (`relayOutbox`, scheduled by EventBridge Scheduler). It reads the oldest waiting messages in every shop through `hold_pending_outbox`, which only `hold_worker` may call, sends each to its queue with its rental as the group and what it names as the deduplication ID, and marks it sent only once the queue took it. Most messages are sent by the request that wrote them, so the relay mostly finds nothing. The capture's key is fixed by the rental and its order, so repeating it captures nothing twice, and the money log takes the capture's identifier once. PayPal's amount must equal the stored fee to the cent, or the execution fails and nothing is booked.

**Idempotency at each layer**

- **To PayPal:** the `PayPal-Request-Id` header carries the execution's key. A retry cannot capture twice.
- **From PayPal:** each event's ID is unique in `paypal_events`. A redelivered event is ignored.
- **In the money log:** each row has a unique PayPal reference. Applying the same event twice writes nothing new.
- **In the queues:** work is ordered per rental, so two workers never act on the same hold at once.

**Invariants the code enforces**

- The amount captured from a hold never exceeds its reserved amount.
- The amount captured never exceeds the approved claim.
- Captured plus released never exceeds reserved.
- A hold reaches exactly one final state.

---

## 8. PayPal integration

### 8.1 The shop's PayPal account

Each shop is paid into its own PayPal business account. Hold does not hold funds at any point.

**In the hackathon,** each demo shop maps to a sandbox business account. Its API credentials are stored in Secrets Manager and referenced from `paypal_accounts`.

**In production,** Hold would act for shops through PayPal's partner model, with each shop's consent and without holding its credentials. The code reaches the account through a credential provider interface, so that change is confined to one adapter.

### 8.2 Placing the hold: three strategies

PayPal sets two constraints that shape this.

- An order that authorizes first cannot contain more than one purchase unit. The fee and the deposit cannot be two parts of one such order.
- A hold lasts 29 days. A hold placed when a tourist books three weeks ahead would be nearly spent by the time they arrive.

So the hold is always its own authorization, and when it is placed depends on the rental. All three strategies sit behind one interface and produce the same hold object.

| Strategy | When it is used | How it works | Approvals by the renter |
|---|---|---|---|
| **At the counter** | Advance bookings, and the safe default | The fee is paid at booking with an ordinary order. At pickup, staff show a QR code and the renter approves the hold on their own phone. | One at booking, one at pickup |
| **Combined** | Walk-in and same-day rentals | One authorize-first order for the fee plus the deposit. The fee is captured at once, marked as not the final capture. The rest stays reserved as the hold. | One |
| **Saved method** | Returning renters, where the shop is approved for it | The renter saves their PayPal wallet with the shop once. Hold places the hold shortly before pickup with no action from the renter, and can replace it for long rentals. | None after the first |

**Which is built first.** "At the counter" uses only behavior PayPal documents plainly, so it is the baseline. "Combined" gives the best walk-in experience. The sandbox confirmed on 14 October 2026 that the remainder stays held after a partial capture and can then be captured or released. Renewal after a partial capture is still to be confirmed after day 4. "Saved method" is optional.

### 8.3 Which PayPal capability does what

| Hold need | PayPal capability | Call | Confirmed by |
|---|---|---|---|
| Rental fee | Orders v2, capture | Create order, capture order | `PAYMENT.CAPTURE.COMPLETED` |
| Place the hold | Orders v2, authorize | Create order with intent to authorize, authorize order | `PAYMENT.AUTHORIZATION.CREATED` |
| Renew the hold | Payments v2 | Reauthorize the authorization | Read-back of the new authorization |
| Release the hold | Payments v2 | Void the authorization | `PAYMENT.AUTHORIZATION.VOIDED` |
| Charge damage | Payments v2 | Capture the authorization for the claim amount, as the final capture | `PAYMENT.CAPTURE.COMPLETED` |
| Check a hold | Payments v2 | Show authorization details | |
| Reduce a charge | Payments v2 | Refund the capture | `PAYMENT.CAPTURE.REFUNDED` |
| Damage beyond the hold | Invoicing v2 | Create and send invoice | `INVOICING.INVOICE.PAID` |
| Returning renter | Payment Method Tokens v3 | Setup token, payment token, order with the saved method | `VAULT.PAYMENT-TOKEN.CREATED` |
| Shipped rental | Shipment tracking | Add and read tracking | Tracking status |
| Dispute | Disputes v1 | Read dispute, provide evidence | `CUSTOMER.DISPUTE.*` |
| The record of truth | Webhooks, Transaction Search | | |
| Owner identity | Log in with PayPal | OAuth exchange | |
| Owner's assistant | Agent Toolkit, sandbox MCP server | Read tools | |

### 8.4 The life of one hold in PayPal calls

**Placing, at the counter**

1. The worker creates an order in the shop's account with intent to authorize, for the hold amount, described as a refundable hold.
2. The renter approves it in PayPal from the QR code or link.
3. On approval, the server authorizes the order.
4. PayPal returns an authorization with its identifier and expiry time.
5. Hold records both clocks and marks the hold placed when the event is verified.

**Releasing after a clean return**

1. A staff member confirms the clean return.
2. The worker voids the authorization.
3. `PAYMENT.AUTHORIZATION.VOIDED` confirms it.
4. The renter is told that nothing was charged.

**Charging damage**

1. The claim reaches charging.
2. If the assured period has passed and the hold has not been renewed, the worker renews it and reads the new authorization back. This is the only place Hold renews (section 7.4).
3. The worker captures the claim amount as the final capture, at once, on the current identifier.
4. `PAYMENT.CAPTURE.COMPLETED` confirms it.
5. The worker reads the authorization back to confirm the remainder was released.
6. Renter and shop receive the same record.

**If the renewal or the capture fails**

1. A refused renewal marks the hold at risk. The worker still captures on the original identifier, without assurance.
2. A refused capture is not retried with a second renewal, which PayPal does not allow. The claim is sent as an invoice with the evidence pack, and the hold is released.
3. The owner is told in plain words what happened.

### 8.5 The webhook pipeline

```mermaid
sequenceDiagram
    participant PP as PayPal
    participant WEB as web
    participant DB as Aurora
    participant Q as SQS
    participant WK as worker

    PP->>WEB: POST event with transmission headers
    WEB->>DB: store raw body and headers, unique on event ID
    WEB->>Q: enqueue event ID, grouped by rental
    WEB-->>PP: 200 OK
    Q->>WK: deliver event ID
    WK->>WK: verify signature
    WK->>PP: GET the resource the event names
    PP-->>WK: current state of the resource
    WK->>DB: one transaction. advance state, write money event, write outbox
    WK->>Q: publish domain event for messages
```

**Rules**

- **Store first.** The raw body is saved before anything else, so no event is lost and the signature is checked against the exact bytes received.
- **Answer quickly.** PayPal retries a delivery that does not return success, up to 25 times over three days.
- **Verify before applying.** An event that fails verification is kept for inspection and never applied.
- **Read the resource back.** Hold does not trust the event body for amounts or status.
- **Tolerate disorder.** State machines only move forward, so a late or repeated event changes nothing.

**Simulator events.** PayPal's webhook simulator sends events that PayPal's own verification call rejects, so Hold never applies them. In the test environment, the simulated PayPal signs its own events and verifies only those.

**As built** (`apps/web/src/server/paypal-webhook.ts`, `packages/settle/src/paypal-events.ts`):

- **The subscription.** Connecting PayPal subscribes the shop's own address, `/api/webhooks/paypal/{accountId}`, to the events in `PAYPAL_EVENT_TYPES`, and keeps the subscription's id beside the account. A shop connected earlier turns it on from its PayPal page. PayPal takes only an HTTPS address, so on a developer's machine there are no events and Hold works without them.
- **The intake** reads the shop from the account in the address through `hold_paypal_account`, before any shop is chosen. It stores the exact body and PayPal's signing headers, once per PayPal event ID, with an outbox message in the same transaction, sends that message to the `paypal-events` queue at once, and answers 200. Events about one order share a group: a capture is grouped by the order it was made on. Deliveries are limited per network and to 64 KB.
- **Verification** asks PayPal's `verify-webhook-signature` about the exact stored body, against the account's subscription. A rejected event is kept, marked `rejected`, and never applied.
- **What is applied.** `CHECKOUT.ORDER.APPROVED` on a fee order: the order is read back, and only if PayPal shows it approved is the fee captured. This books a renter who approved in PayPal and never came back to Hold. `PAYMENT.CAPTURE.COMPLETED` on a fee order: the order is read back for who paid and how much, and confirmed as in section 6.5. `CHECKOUT.ORDER.APPROVED` on a hold order: read back, and only if approved is the authorization recorded and carried out. `PAYMENT.AUTHORIZATION.CREATED` on a hold order: the authorization is read back and confirmed as in section 6.6. Every other event is kept and marked `ignored` until the feature that acts on it is built.

### 8.6 Reconciliation

Every night Hold compares its records with PayPal.

- **Every open hold** is read from PayPal. Its status and expiry must match Hold's record.
- **Every capture and refund** in the shop's transaction history must have a money event in Hold.
- **A difference** raises an alert. Missing events are applied through the normal path. Anything else is shown to the owner and is never corrected silently.

### 8.7 Disputes

A renter may open a dispute with PayPal despite the reply period.

1. `CUSTOMER.DISPUTE.CREATED` arrives and Hold links the dispute to the rental by the capture it names.
2. The owner is told, with the evidence pack already built.
3. The owner reviews and confirms.
4. Hold uploads the evidence pack to PayPal as the shop's response.
5. Later events update the dispute's state. If the shop loses, the refund appears as a money event like any other.

Hold never responds to a dispute without the owner's confirmation.

### 8.8 The PayPal adapter

`packages/paypal` is the only code that talks to PayPal.

- **One method per business action,** such as `placeHold`, `renewHold`, `releaseHold` and `captureFromHold`, each requiring an idempotency key.
- **The port** is `PayPalHolds` in `packages/paypal/src/port.ts`: `createHoldOrder`, `readHoldOrder`, `placeHold`, `readAuthorization`, `renewHold`, `releaseHold` and `captureFromHold`. Every write takes an idempotency key. After placing, renewing or releasing, the adapter reads the authorization back from PayPal instead of trusting the reply.
- **A fake PayPal** (`createFakePayPal`) implements the same port in memory with a clock the caller controls. It is what renewal and expiry are tested against, and what the integration tests use.
- **Typed results and typed errors,** so callers can tell a decline from an expired hold from an outage.
- **Token handling.** Access tokens are fetched per shop account, cached until shortly before expiry and never logged.
- **Debug IDs.** PayPal returns a debug ID with each response. Hold logs it with every call.
- **Retry policy.** Network and server errors are retried with backoff and the same idempotency key. Client errors are not retried.

**How the Agent Toolkit is used.** The toolkit has no tool to authorize, renew, release or partly capture a hold, so the adapter calls the REST API for those. The toolkit is used for invoices, refunds, shipment tracking and reading disputes and transactions, and it gives the owner's assistant its PayPal read tools.

---

## 9. Evidence architecture

Hold's claim to fairness rests on its evidence. This section describes how a photograph becomes something both sides can rely on.

### 9.1 Capture sessions

A capture session is one guided set of photographs of one item.

| Kind | Taken by | When |
|---|---|---|
| Handover | Staff | When the item leaves |
| Return | Staff | When the item comes back |
| Packing | Staff | Before a shipped item is sealed |
| Unboxing | Renter | When a shipped item arrives |
| Send-back | Renter | Before a shipped item is returned |
| Condition | Renter | Within a day of a handover, photographs of anything staff missed (section 6.7) |

**How a session runs**

1. The app loads the photo plan for the item type.
2. For each view, the camera shows a framing outline. In a return session it also shows the handover photograph faintly, to match the angle.
3. The phone checks sharpness, brightness and framing at once, and asks for a retake if needed.
4. The photograph uploads straight to the evidence bucket through a short-lived signed link, with its fingerprint attached so S3 rejects a corrupted upload.
5. When every required view is present, the session is sealed.

**Return capture implemented, 20 October 2026.** Staff start a return only for an `out` or `overdue` rental with a sealed handover. The return keeps that handover's photo plan, even if the item type is edited later. Starting again resumes the same session. Retakes preserve earlier originals. Only when all items have sealed returns does the rental move to `returned`, and the same transaction writes one comparison and outbox message per item. Handovers and returns share upload validation but their actions refuse each other's session IDs. A return cannot add permanent known marks through a handover action. Sample photographs carry `quality.simulated = 1`; the return capture screen labels saved samples and sample handover guides, and any comparison using them is marked simulated in its record and on screen.

### 9.2 What makes a photograph evidence

| Property | How Hold provides it |
|---|---|
| **It cannot be changed** | The evidence bucket uses S3 Object Lock. An object cannot be overwritten or deleted until its retention period ends. |
| **It can be proved identical** | A SHA-256 fingerprint is recorded in the database when the upload completes. |
| **Its time is trustworthy** | The recorded time is when the server received it, not the phone's clock. |
| **Its place in history is fixed** | Each sealed session writes a manifest listing its photographs and fingerprints, plus the fingerprint of the item's previous manifest. This forms a chain per item. Removing or replacing an earlier session would break it. |
| **It shows the right item** | The comparison checks identifying features and flags a mismatch. |
| **It is not a reused image** | A perceptual fingerprint is compared with earlier sessions for the same item. |

### 9.3 Two copies of every photograph

- **The original** stays locked in the evidence bucket and is never shown directly.
- **The display copy** is smaller, has faces blurred, and lives in the display bucket. It is what people see on screen.

Faces are found by Amazon Rekognition and blurred before the display copy is saved. If a dispute requires it, the owner can release the original.

### 9.4 The item passport

Each item carries a list of marks.

- A mark has a view, a region, a description and the session where it was first seen.
- At handover, staff confirm the known marks and can add new ones. The renter sees the list and can add a photograph of anything missed.
- During comparison, a difference that matches a known mark is labelled as already present and cannot be claimed.
- When damage is charged, it becomes a mark, so the next renter is not charged for it.
- When the item is repaired, the mark is closed.

This is what guarantees that nobody pays for an earlier renter's damage.

The passport is the page `/shop/items/{id}` (section 13.6). It shows the item's marks, its rentals and its sealed photo sessions in chain order, read by `itemPassport` in `packages/db`.

### 9.5 The evidence pack

One document per rental, built by the worker.

1. The rental's details and the versions of the price list and wear policy the renter agreed to.
2. The handover session and the condition report the renter confirmed.
3. The return session.
4. The comparison: each finding with both photographs and the region outlined.
5. The claim, each line with its price list entry.
6. The approvals, including anything a person changed.
7. The renter's reply, if any.
8. The PayPal record: hold placed, amount captured, amount released.
9. A manifest of every photograph's fingerprint.

The pack is stored locked, shown to the renter, and is what Hold uploads if a dispute is opened. A new version is written if anything changes. Earlier versions remain.

---

## 10. AI architecture

### 10.1 The principle

The AI is good at looking and at language. It has no authority over money. It produces findings and words. People produce decisions.

```mermaid
flowchart LR
    pair["Handover and return photos"]
    q["Quality check<br/>plain code"]
    align["Align and find regions<br/>plain code"]
    look1["First look<br/>Claude, full views and crops"]
    look2["Second look<br/>Claude, crops only, fresh context"]
    marks["Match known marks<br/>plain code"]
    price["Price from the list<br/>plain code"]
    person["Person approves"]
    claim["Claim"]

    pair --> q
    q --> align
    align --> look1
    look1 --> look2
    look2 --> marks
    marks --> price
    price --> person
    person --> claim
```

### 10.2 The comparison pipeline

Run by the worker for each item when a return session is sealed.

**Step 1. Quality.** Plain code scores each photograph for sharpness, brightness and framing. This already happened on the phone. It runs again so the record does not depend on the phone.

**Step 2. Normalize.** Orientation, size and exposure are corrected so the two photographs of a view are comparable.

**Step 3. Align.** The return photograph is lined up with the handover photograph. An alignment score is recorded. A poor score means the angles differ too much to compare reliably.

**Step 4. Candidate regions.** Plain code marks areas that changed between the aligned pair. These are hints. Most will be shadows, reflections or dirt.

**Step 5. First look.** Claude receives both full photographs of the view, close crops of each candidate region from both, the item type, the known marks and the wear policy. It returns structured findings:

| Field | Content |
|---|---|
| View | Which view of the item |
| Region | Where in the photograph |
| Class | No change, ordinary wear, damage, missing part, or cannot tell |
| Confidence | A stated level |
| Description | A short plain sentence |
| Suggested price entry | A code from the shop's list, or none |

The model is also asked to report anything the candidate regions missed.

**Step 6. Second look.** Each finding classed as damage or missing is checked again by a separate call with a fresh context. That call sees only the two close crops and a neutral question. It does not see the first call's reasoning. If the two disagree, the finding becomes "cannot tell".

**Step 7. Known marks.** Plain code compares each finding's region with the item's marks. A match is relabelled as already present and removed from consideration. Marks reported during this rental through the incident desk are checked too. A match there is labelled as reported during the rental and linked to any line the renter already agreed.

**Step 8. Price.** Plain code looks up the suggested entry in the price list version the renter agreed to. If the code does not exist in that list, the finding is left for a person to price.

**Step 9. Outcome.** The comparison ends in one of three results.

| Result | Condition | What happens |
|---|---|---|
| **Clean** | No damage or missing findings, nothing uncertain | Staff confirm and the hold is released |
| **Findings** | One or more confirmed findings | A draft claim is prepared for a person |
| **Needs a person** | Anything uncertain, a poor alignment, a possible item mismatch | Staff are asked to look at the item itself |

### 10.3 When the system defers

**Current implementation, 20 October 2026.** `packages/compare` runs the pipeline after all items' return sessions are sealed. The worker remeasures originals with OpenCV, corrects orientation and size with sharp, corrects exposure as a pair, aligns small translations, and groups changed pixels into candidate regions. This initial aligner does not estimate rotation, scale or perspective; a pair outside its supported alignment must go to a person. Its starting thresholds are in `PAIR_LIMITS`; confidence and known-mark overlap rules are in `INSPECTION_LIMITS`. They have synthetic-image and recorded-response tests, not a measured accuracy claim. The tuning evaluation and the public scorecard remain required before release.

The first look sees full photographs and candidate crops with the agreed wear policy and price codes as quoted data. The second look gets only neutral paired crops in a fresh request, without the first look's description or proposed price. Code translates handover marks into the aligned return coordinates before excluding overlaps, clears unknown price codes, and gives uncertainty precedence over confirmed findings. Every observation in a second look must agree on the damage class at the required confidence; a mixed or uncertain response defers. Prices are resolved only against the rental's saved price-list version. Exact original or perceptual-fingerprint matches with earlier evidence defer without calling the model; renter condition photographs never become the baseline.

One comparison permits at most ten logical model calls, each with at most 4,096 output tokens, explicit high effort and a shared 120-second model-phase deadline. Each call has a 30-second timeout and no transport retries. The documented refusal fallback can make one additional physical request per logical call, so the physical ceiling is twenty requests and 81,920 output tokens. No tools are offered. Model identity, prompt version, call/token totals and per-view alignment scores are persisted; refusals, invalid output and ordinary service failures defer. An unexpected processing error records a deferred result before being surfaced to the queue handler.

Comparison records have a `started_at` lease, `deferred_reason` and `simulated` marker (migration 0016). A running lease can be reclaimed after three minutes; completion must match the current lease. Duplicate deliveries cannot duplicate findings or replace a completed result. The comparison Lambda has its own IAM role with evidence read access and model-scoped Mantle inference, but no PayPal credentials, execution queue access or photograph write access. The existing outbox relay is the fallback if immediate delivery fails; its configured queue addresses and send grants include both comparisons and media.

The staff review shows **Clean**, **Findings**, or **Needs a person**, paired display photographs and observations. A person can append their own outcome and written reason to the audit trail even while AI is unavailable. This preserves the model's original result and records the named reviewer. Neither inspection nor a manual note creates an approval, changes the hold, prepares a charge, or closes the rental. The claim and settlement parts of the spine follow this inspection feature.

Hold is designed to say "I cannot tell" readily. It defers to a person when:

- a photograph's quality score is below the threshold
- the alignment score is poor
- lighting differs strongly between the two sessions
- the two looks disagree
- confidence is below the shop's threshold
- the item's identifying features do not match

A wrong damage finding on a clean return is treated as the worst error the system can make. The thresholds are tuned to avoid it, at the cost of asking people to look more often.

### 10.4 Language

| Task | Input | Safeguard |
|---|---|---|
| **Turn the shop's rules into a price list and wear policy** | The owner's plain description | The owner reviews and publishes the result. Nothing takes effect unreviewed. |
| **Write the claim message** | The approved claim | The number guard checks every amount and item against the claim. |
| **Translate for the renter** | The message and the renter's language | The number guard runs on the translation too. |
| **Summarize a contested claim** | The claim, the renter's reply and photographs | The summary must present both sides. It makes no recommendation. |
| **Draft rental terms** | The shop's settings | The owner reviews and publishes. |

**The number guard.** Before any message about money is sent, plain code extracts every amount and item name from it and compares them with the claim record. If anything differs or is missing, the message is discarded and a fixed template is used. A renter can never read an amount that the claim does not contain.

### 10.5 The owner's assistant

The owner can ask questions and give instructions in plain language.

- **Model:** Claude Opus 5.5 on Amazon Bedrock (`anthropic.claude-opus-5-5`), through the Bedrock SDK's Mantle client and the Anthropic SDK's tool runner.
- **Tool choice is automatic,** with strict tool schemas.
- **Every tool call passes through a gateway** that checks the owner's identity, shop and role.

| Tool | Kind |
|---|---|
| `list_holds`, `get_hold` | Read |
| `list_rentals`, `get_rental` | Read |
| `list_claims`, `get_claim` | Read |
| `damage_report`, `item_history` | Read |
| `search_paypal_transactions`, `get_paypal_insights` | Read, through the PayPal toolkit |
| `get_shipment_status` | Read, through the PayPal toolkit |
| `propose_release` | Proposal, confirmed by the owner on screen |
| `propose_extension` | Proposal, confirmed by the owner on screen |
| `draft_message_to_renter` | Draft, sent only after the owner confirms |

**An asymmetry by design.** The assistant can propose releasing a hold, which returns money to a renter. It has no tool to propose a charge. A charge can only begin from a claim built from photographs and approved on the claim screen.

**Proposals are records.** A proposal names the records it concerns and never an amount. It is checked again against the current state when the owner approves it. The operations agent writes the same proposals each night and prepares the owner's morning queue.

**Tools have tiers.** Read, draft, propose, notify, or act under a mandate. No tier permits a charge. See `extensions.md` sections 4 and 6.

### 10.6 Defense against manipulation

| Threat | Defense |
|---|---|
| A renter's comment contains instructions aimed at the model | Renter text is passed as data. The summary step has no tools. |
| A renter uploads an edited photograph | Renter photographs are labelled as renter-supplied and are never used as the comparison baseline. |
| Staff substitute an old photograph | Uploads come from the live camera session. Reused images are flagged by perceptual fingerprint. |
| The model invents a price | Prices are read from the database. The number guard checks every message. |
| The model overstates damage | The second look, the confidence threshold and a person's approval. |
| The owner's assistant is asked to charge someone | No such tool exists. |
| Text in a PayPal memo or dispute note steers the operations agent | It can only write proposals of allowed kinds, for exceptions that plain code found, and a person approves each one. |
| A renter's outside assistant sends instructions or bad data | Everything it sends is stored as data. No tool it can call takes an amount or moves money. |
| An advocate is talked into a bad agreement | The referee is plain code. No move outside a side's mandate is accepted. |
| An advocate reveals its side's limit | Limits are never placed in the other side's context. Amounts in argument text must match the offer. |
| An assistant blocks a shop's items with unpaid bookings | Unpaid bookings expire in fifteen minutes and are capped per caller. |

### 10.7 Model configuration

- Model Claude Opus 5.5 on Amazon Bedrock, `anthropic.claude-opus-5-5`, with a client-side refusal fallback to `anthropic.claude-opus-4-8`.
- Effort is set explicitly on every call: high for both looks, medium for summaries, low for short messages.
- Structured output for all findings.
- The stop reason is checked on every response. A refusal is handled as a normal outcome, and server-side fallbacks are enabled.
- The model and prompt version used are stored with each comparison, so a result can be explained later.

### 10.8 Measuring the comparison

`eval/` holds pairs of photographs with known outcomes: no change, ordinary wear, and damage of several kinds, in good and poor light, on each supported item type.

| Measure | Why |
|---|---|
| Share of real damage found | Shows the shop is protected |
| Share of clean returns wrongly flagged | The error that harms renters. Kept as low as possible. |
| Share sent to a person | Shows the cost of caution |
| Agreement between the two looks | Shows whether the second look adds value |
| Whether stated confidence matches reality | Shows the thresholds can be trusted |

The set runs before every release and whenever a prompt or threshold changes.

**The results are published.** The set has a tuning half and a gate half. Only the gate half is published, each number with its count, in the owner's view, on a public page and in the README. The build fails if the gate half gets worse. Every closed claim also records what a person decided about each finding. See `extensions.md` section 5.

---

## 11. Key flows

### 11.1 Booking and placing the hold at the counter

```mermaid
sequenceDiagram
    participant R as Renter
    participant WEB as web
    participant PP as PayPal
    participant WK as worker
    participant DB as Aurora
    participant S as Staff

    R->>WEB: book an e-bike for three days
    WEB->>R: fee, hold amount, damage price list
    R->>PP: approve the rental fee
    WEB->>PP: capture the fee order
    PP->>WK: PAYMENT.CAPTURE.COMPLETED
    WK->>DB: rental booked, awaiting hold
    Note over R,S: later, at pickup
    S->>WEB: open the rental, show the QR code
    R->>PP: approve the hold on their own phone
    WEB->>PP: authorize the hold order
    PP->>WK: PAYMENT.AUTHORIZATION.CREATED
    WK->>DB: hold placed, record both clocks, create upkeep schedules
    WK-->>S: rental is ready for handover
```

### 11.2 Guided handover

```mermaid
sequenceDiagram
    participant S as Staff
    participant APP as web app on the phone
    participant S3 as S3 evidence bucket
    participant WK as worker
    participant DB as Aurora
    participant R as Renter

    S->>APP: start handover for the item
    APP->>S: first view, with framing outline
    S->>APP: take the photograph
    APP->>APP: check sharpness, brightness, framing
    APP->>S3: upload with fingerprint
    Note over S,APP: repeated for each view
    APP->>DB: seal the session
    WK->>S3: read originals
    WK->>S3: write face-blurred display copies
    WK->>DB: write manifest, extend the item's chain
    WK->>R: condition report by link
    R->>APP: confirm, or add a photograph of anything missed
    APP->>DB: rental is out
```

### 11.3 A clean return

```mermaid
sequenceDiagram
    participant S as Staff
    participant APP as web app on the phone
    participant WK as worker
    participant CL as Claude
    participant DB as Aurora
    participant PP as PayPal
    participant R as Renter

    S->>APP: start return, same views with the handover ghost
    APP->>DB: seal the return session
    WK->>WK: quality, normalize, align, candidate regions
    WK->>CL: first look
    CL-->>WK: no damage found
    WK->>DB: comparison is clean
    WK-->>S: no new marks
    S->>APP: confirm clean return
    APP->>DB: approval, execution through the outbox
    WK->>PP: void the authorization
    PP->>WK: PAYMENT.AUTHORIZATION.VOIDED
    WK->>DB: hold released
    WK->>R: your hold has been released, nothing was charged
```

### 11.4 A return with damage

```mermaid
sequenceDiagram
    participant S as Staff
    participant WK as worker
    participant CL as Claude
    participant DB as Aurora
    participant R as Renter
    participant PP as PayPal

    S->>WK: return session sealed
    WK->>CL: first look
    CL-->>WK: scratch on the frame, confident
    WK->>CL: second look, crops only, fresh context
    CL-->>WK: confirms new damage
    WK->>DB: finding kept, not a known mark, priced from the list at 35.00
    WK-->>S: draft claim with photographs side by side
    S->>DB: approve the claim
    WK->>R: claim with photographs, price and reply options
    R->>DB: accept
    DB->>WK: execution through the outbox
    WK->>PP: capture 35.00 as the final capture
    PP->>WK: PAYMENT.CAPTURE.COMPLETED
    WK->>PP: read the authorization, confirm the remainder is released
    WK->>DB: hold captured, add the scratch to the item's marks
    WK->>R: 35.00 charged, 265.00 released, with the full record
```

### 11.5 A contested claim

```mermaid
sequenceDiagram
    participant R as Renter
    participant WEB as web
    participant WK as worker
    participant CL as Claude
    participant O as Owner
    participant DB as Aurora
    participant PP as PayPal

    R->>WEB: contest, with a comment and two photographs
    WEB->>R: one-time code to the PayPal email
    R->>WEB: enter the code
    WEB->>DB: claim contested
    WK->>CL: summarize both positions, no recommendation
    CL-->>WK: neutral summary
    WK-->>O: claim, renter's reply and summary
    O->>DB: decide. remove one line, keep one
    DB->>WK: execution through the outbox
    WK->>PP: capture the reduced amount as the final capture
    PP->>WK: PAYMENT.CAPTURE.COMPLETED
    WK->>DB: hold captured, new evidence pack version
    WK->>R: decision, reason and updated record
```

### 11.6 Charging a hold after day three

```mermaid
sequenceDiagram
    participant Q as Executions queue
    participant WK as worker
    participant DM as Domain
    participant PP as PayPal
    participant DB as Aurora
    participant O as Owner

    Q->>WK: capture the approved claim
    WK->>DM: plan the charge from the authorization's clocks
    DM-->>WK: assured period over, not yet renewed: renew, then capture
    WK->>PP: reauthorize the authorization
    PP-->>WK: new authorization identifier
    WK->>PP: read the new authorization
    WK->>DB: record new identifier and new assured period
    WK->>PP: capture on the new identifier, as the final capture
    Note over WK,O: if the renewal is refused
    WK->>DB: hold at risk
    WK->>PP: capture on the original identifier
    Note over WK,O: if the capture is refused
    WK->>DB: claim sent as an invoice, hold released
    WK-->>O: what happened, in plain words
```

A long rental is kept protected by the replacement in section 7.4, not by renewal.

### 11.7 A dispute

```mermaid
sequenceDiagram
    participant PP as PayPal
    participant WK as worker
    participant DB as Aurora
    participant O as Owner

    PP->>WK: CUSTOMER.DISPUTE.CREATED
    WK->>PP: read the dispute
    WK->>DB: link to the rental by its capture
    WK-->>O: dispute opened, evidence pack ready
    O->>DB: review and confirm the response
    WK->>PP: provide evidence with the evidence pack
    PP->>WK: CUSTOMER.DISPUTE.UPDATED
    PP->>WK: CUSTOMER.DISPUTE.RESOLVED
    WK->>DB: record the outcome
    WK-->>O: result in plain words
```

### 11.8 Flows added by the extensions

| Flow | Where |
|---|---|
| The operations agent's nightly run | `extensions.md` section 6.3 |
| A booking made by a renter's assistant | `extensions.md` section 8.4 |
| A negotiation between two advocates | `extensions.md` section 9.8 |
| Damage agreed during a rental | `extensions.md` section 10.4 |

---

## 12. Identity and access

### 12.1 Owners and staff

- **Amazon Cognito** holds one user pool for owners and staff.
- **Passwordless sign-in** by emailed code or passkey, on Hold's own `/sign-in` and `/sign-up` pages, which call Cognito. Decision 25 says why.
- **Who signs up.** Only a shop's owner. Staff are invited by the owner and sign in with that address. Renters have no account.
- **How sign-up and sign-in run.** Both pages check their input in the browser and on the server with one function (`apps/web/src/features/auth/auth-input.ts`), then call Cognito through the `Identity` port in `packages/auth`. The steps are in `apps/web/src/features/auth/sign-in-flow.ts`.
  - **Sign-up** creates a Cognito account with no password and emails a six-digit code to confirm the address. The confirmation signs the person in with no second code. Then one transaction creates the person, the shop and their `owner` role, and writes the audit line (`registerOwner` in `packages/db`). The person also joins the `owner` group in Cognito.
  - **Sign-in** emails an eight-digit code (Cognito's `USER_AUTH` flow with `EMAIL_OTP`).
  - **An address that already has an account** is sent a sign-in code by the sign-up page, and the new shop is added to that account. One person may own several shops.
  - **The same answer for every address.** An address with no account gets the same "check your email" step, and a code typed for it is simply wrong. The forms cannot be used to find out who has an account.
  - **Between the two steps,** the address, Cognito's session for the attempt and the shop to create travel in a cookie sealed with AES-256-GCM. The browser cannot read or change it. Cognito keeps an attempt open for ten minutes and ends it after three wrong codes.
  - **The session** is the Cognito access token and refresh token, each in an HTTP-only cookie. Every request checks the access token on the server with `aws-jwt-verify`. When it lapses, the proxy uses the refresh token for a new one. Signing out revokes the refresh token at Cognito.
  - **Rate limits of Hold's own,** on top of Cognito's: five code emails per address and forty sign-in requests per network address in fifteen minutes, counted in `rate_limits` by fingerprint, so no address is stored. The network address is the last entry of `x-forwarded-for`, the one App Runner's load balancer adds. A request with none, or from loopback, comes from a developer's machine and is limited by address only.
- **The test environment.** With `HOLD_ENVIRONMENT=test`, the web app uses an in-memory identity service that sends a fixed code, and a PGlite database. Only the end-to-end tests set it. Every other environment refuses to start without Cognito and Aurora settings.
- **A passkey as the second factor** for owners and managers, and for staff whose approval limit is above the shop's threshold (`needsStrongSignIn` in `packages/domain`). Cognito cannot follow an emailed code with an authenticator app: a person who turns one on can only sign in with a password from then on. A passkey with user verification is the device and the person's fingerprint, face or PIN together, so it is multi-factor on its own. The user pool requires user verification and its relying party is the host of the web app's address (`webPublicUrl` in `infra/cdk.json`), so passkeys work on the deployed site and not on `localhost`. A developer signs in with an emailed code, which works everywhere. Before the app had an address, the relying party was `localhost`.
  - A person's first passkey is registered from a session an emailed code proved, on the shop's security page: there is nothing stronger yet. Every later one needs a session a passkey proved, so someone who reached the person's inbox cannot add a passkey of their own. A passkey can then be used to sign in.
  - **Sign-in answers every address the same way.** For an emailed code, any refusal by the identity service still leads to the code step, for an attempt that fails as a wrong code would. For a passkey, the options sent to the browser leave out the account's list of credentials, and any refusal gets options of the same shape for an attempt that fails as an unrecognized passkey would. Only "too many attempts" is said plainly. Confirming with a passkey, which may say "you have none", is open only to the person signed in, and always uses their own address.
  - **How a session was proven** is kept beside it in a sealed cookie, bound to the person the access token names and to the session's refresh token, so a record from one account's session counts for nothing on another's. Every change to prices, staff or PayPal checks it on the server: a person who needs a passkey and signed in with an emailed code is asked to confirm with their passkey first, and returns to the page they were on.
- **Staff are invited, never sign up.** An owner or a manager invites by email, with a role and, for counter staff, an approval limit. Owners invite managers, counter staff and read-only members; managers invite counter staff and read-only members (`mayInvite`). The email carries a link with a random token, of which only the SHA-256 fingerprint is stored. The link works once, for seven days. Following it sends a code to the invited address, never to one the visitor types; once the code is typed, the role is created and the invitation is marked accepted, in one transaction.
- **Every change to a shop** goes through `shopAction` in `apps/web/src/server/shop-access.ts`, which authenticates, resolves the shop and the caller's role, checks the passkey where needed, validates the form against a strict schema, opens the transaction with the caller's identity and writes the audit line. A refusal rolls the transaction back. A test fails on any export of `features/shop/actions.ts` not built by it.
- **Tokens** are verified by every service on every request.

### 12.2 Authorization

Three layers, each independent of the others.

| Layer | Question | Where enforced |
|---|---|---|
| **Account type** | May this person use the shop side of Hold at all? | Cognito group, checked at the edge |
| **Role in a shop** | What may this person do in this shop, and up to what amount? | Service, on every request, from `staff_roles` |
| **Row-level security** | Can this query see this row? | Aurora, on every query |

**How row-level security works.** At the start of each request the service opens a transaction with `inShop` from `packages/db`. It sets the role, the shop and, for a signed-in person, the user's ID, each for that transaction only. Every table has a policy that allows a row only inside that shop, and only if the named person has a role there. A renter link or a worker job names no person and is bound to its shop by the code that resolved it. A query that forgets its filter, or runs outside `inShop`, returns nothing.

- `users` and `renters` carry no shop. A person sees themselves and their colleagues in the current shop. A shop sees only the renters who rented from it. Renters are created only through `hold_renter_for_payer`, from the identity PayPal returned.
- No service role may delete a row. The money log, approvals and the audit trail also refuse updates. Both rules are grants, so they hold even for a query that passes every policy.

**Service access.** The worker uses a separate database role, `hold_worker`, with its own login in the secret `hold/database/worker`, and each job names the single shop it is working on. The migration gives `hold_worker` its password once that secret exists, so the first deploy of the worker needs a second migration run. Only `hold_worker` may read the outbox across shops, through `hold_pending_outbox`.

### 12.3 Renters

Renters have no account. They act through links.

| Property | How |
|---|---|
| **Bound to one rental** | The link's token names one rental and nothing else |
| **Signed** | The token is 32 random bytes and a 16-byte HMAC-SHA-256 of them, with a key derived from the secret `hold/web/renter-link-key`, which is not the cookie key (`packages/auth/src/renter/renter-link.ts`). The web app and the worker read it, so the worker can sign the links it emails without being able to seal a sign-in. On a developer's machine it falls back to the cookie key. A changed token is rejected before the database is asked. |
| **Expiring** | Each link has an end date tied to the rental's life |
| **Scoped** | View, pay, confirm condition, extend, accept, contest. Each link carries only the scopes it needs. A booking's link carries view and pay. |
| **Revocable** | Only the token's fingerprint is stored. Removing it ends the link. |
| **Stepped up for money decisions** | Accepting or contesting a claim requires a one-time code sent to the email PayPal provided |

**Who the renter is.** The renter's identity is the PayPal payer who approved the order. Their payer ID, name and email come from PayPal and are not typed in.

**How a link is checked.** Every renter request and page goes through `renterAction` or `renterAccess` in `apps/web/src/server/renter-access.ts`: the network is rate limited, the token's signature is checked, its link is read by fingerprint through `hold_renter_link` before any shop is chosen, the link must be live and carry the scope, and the work runs in transactions bound to the link's shop with no person named. A changed, unknown, expired and revoked link get the same answer. Renter pages are not indexed and send no referrer, so the token in their address never reaches another site.

### 12.4 Connecting the shop's PayPal account

**In the hackathon build,** the owner pastes the client ID and secret of their shop's PayPal sandbox app on the shop's PayPal page. Hold checks them by asking PayPal for a token, then keeps them in Secrets Manager under `hold/paypal/shops/{shop}/sandbox`, and stores only that name in `paypal_accounts`. They are never shown again. Only the owner can connect, and only after confirming with a passkey.

**In production,** the owner would connect through Log in with PayPal and PayPal's partner model, and Hold would keep no credentials. The `CredentialStore` interface in `packages/paypal` is the one place that change touches.

### 12.5 Assistants

A renter's own AI assistant acts through an agent token: signed, bound to one rental, scoped, expiring, and revocable by the renter. It is issued only after PayPal confirms the fee was paid, and only to the caller that made the booking. Before that, an assistant has no identity and can only read public information, quote and book. No scope moves money. See `extensions.md` section 8.5.

---

## 13. Interfaces

### 13.1 HTTP API for owners and staff

Served by `web`. All routes require a Cognito token.

| Group | Purpose |
|---|---|
| `/api/shops` | Shop settings, locations, staff and limits |
| `/api/items` | Item types, items, photo plans, item passports |
| `/api/prices` | Price lists and wear policies, draft and publish |
| `/api/rentals` | Create, read, extend, move to another item of the same type, cancel |
| `/api/holds` | Read state, request a hold, show the approval QR code |
| `/api/sessions` | Start, add photographs, seal |
| `/api/uploads` | Short-lived upload links |
| `/api/comparisons` | Read results and findings |
| `/api/claims` | Read, edit, approve, waive, decide |
| `/api/disputes` | Read, confirm the response |
| `/api/reports` | The insights dashboard's rows: money held, captured and released, damage and recovery, staff consistency |
| `/api/assistant` | Conversation with the owner's assistant, streamed |
| `/api/paypal/connect` | Connect the shop's PayPal account |
| `/api/proposals` | The morning queue: read, approve, reject, postpone |
| `/api/mandates` | Standing rules and settlement limits |
| `/api/ladder` | The trust ladder: draft, simulate, publish |
| `/api/incidents` | Incidents reported by renters |
| `/api/accuracy` | The scorecard |

### 13.2 Renter routes

Served by `web`. Each requires a valid signed link.

| Route | Purpose |
|---|---|
| `/r/{token}` | The rental: status, hold, price list |
| `/r/{token}/pay` | Approve the hold at pickup, or its replacement before it ends. PayPal returns the renter here, and the hold is confirmed by a POST, never on arrival. The fee is paid from `/r/{token}` itself. |
| `/r/{token}/paid` | Where PayPal returns the renter. Confirms the fee by a POST, never on arrival. |
| `/r/{token}/condition` | How each item left: its photographs and marks. Within 24 hours of the handover, the link sent then may confirm it or add photographs of anything missed. |
| `/r/{token}/session` | Guided photographs for shipped rentals |
| `/r/{token}/claim` | See a claim, accept or contest it |
| `/r/{token}/record` | The evidence pack |
| `/r/{token}/incident` | Report something that happened during the rental |
| `/r/{token}/negotiation` | Set an advocate's limit, read the transcript, confirm the result |
| `/r/{token}/trust` | The Clean Record, consent and the credential |
| `/r/{token}/assistant` | What a connected assistant did, and a button to disconnect it |

### 13.3 Inbound webhooks

| Route | From | Protection |
|---|---|---|
| `/api/webhooks/paypal/{accountId}` | PayPal | Stored first, then verified with PayPal before anything in it is used. Limited per network and to 64 KB. Under `/api` because the language proxy leaves it alone. |

### 13.4 The MCP server for assistants

Served by `web` at `/mcp` over streamable HTTP. It lets a traveller's own AI assistant find a shop, read its damage prices, get a quote, book, and follow the rental. The person approves every payment in PayPal.

| Caller | Identified by | May |
|---|---|---|
| Any assistant | Nothing. Rate limited. | Read public information, quote, book |
| The assistant of the renter who paid | An agent token bound to one rental | Follow the hold, read the condition report and any claim, ask for an extension, prepare a reply |

No tool takes an amount, and none can capture a hold. Accepting or contesting a claim needs the person's confirmation or a mandate. The tools, the identity rules and the defenses are in `extensions.md` section 8.

### 13.5 Public pages

| Route | Purpose |
|---|---|
| `/` | The home page: the handover and return comparison, the shop's screen beside the renter's, and a summary of each page below |
| `/how-it-works` | One rental in four moments, each beside the record it leaves: the hold, the condition report, the comparison to try and the two ways a rental settles. Then what happens when the renter disagrees, and the questions asked at the counter |
| `/for-shops` | What changes for the owner, the counter staff and the business, the owner's day at a glance, what the shop sets up once, the item passport, the safeguards, and the kinds of shop Hold is built for |
| `/for-renters` | A deposit and a hold as two account statements, the claim as the renter sees it, the published price list, what the renter can count on, and the questions asked before approving |
| `/ai` | The seven steps from photograph to decision and who carries out each, what the AI does and never does, the four answers a comparison can give, how accuracy is measured, and the tiers an agent's tools may use |
| `/paypal` | The life of one hold as the four PayPal calls behind it, which capability meets each rental need, how long a hold lasts beside a card hold, and how a payment's status is confirmed |
| `/sign-in` | Sign-in for owners and staff: a work email, then a code by email. It tells staff they are invited and renters that they need no account |
| `/sign-up` | Sign-up for a shop's owner: name, shop name and work email, and the three steps that follow |
| `/demo` | The demo shop's entry page. Until the demo is deployed it says so and describes the three sample rentals, the three people to sign in as, and what is real and what is simulated |
| `/s/{slug}` | A shop's own page: a renter chooses dates and items, sees the prices and wear policy, and books with nobody signed in. Open only once the shop has PayPal connected, a price list and items. Bookings from it are limited per network (`apps/web/src/server/shop-page-access.ts`). |
| `/simulated-paypal/{order}` | In the test environment only: stands in for PayPal's approval page, says so, and sends the renter back to the order's own return path. Everywhere else it is 404. |
| `/accuracy` | The comparison's measured accuracy, with counts |
| `/verify` | Checks a Clean Record credential |
| `/.well-known/jwks.json` | The public key that credentials are signed with |

The first nine routes are the public site. They take no sign-in, read no shop data and call no service. `/sign-in` and `/sign-up` post to a server function that checks the input and, until Cognito is connected, does nothing else (section 12.1).

- **Languages.** English is served at the bare path. Spanish, French and German are served under `/es`, `/fr` and `/de`, for example `/de/for-shops`. The `[locale]` route segment is the root of the app, and `src/proxy.ts` sends each request to its language. A switch to English goes through `/en/...`, which redirects to the bare path.
- **One list of routes.** `apps/web/src/lib/routes.ts` names every public route. The header, the footer, the phone menu and the tests read that list. A test fails if a route has no page.
- **No in-page links.** Header and footer links open pages. The only `#` link is the skip link for keyboard users.
- **A page opens at its top.** The root layout sets `data-scroll-behavior="smooth"` on `<html>`. Without it, Next.js 16 leaves smooth scrolling on while it changes page, and a page reached from far down another one opens at the old position and glides upward.
- **Example figures.** The amounts shown (300 reserved, 35 taken, 265 released, the 120 fee and the three damage prices) are fixed data from `project-description.md` section 5, held as integer cents in `features/marketing/example-rental.ts`. The owner's day on `/for-shops` is fixed data in the same file. No screen computes an amount.
- **Illustrations say so.** The phone screens, the owner's day, the item passport, the price list and the example findings are pictures of the product, not the product. Each carries a caption that says it is an example.
- **Illustrative photographs.** The frame photograph is a stock photograph with the marks drawn on. The page says so beside it and in the footer. `apps/web/public/images/CREDITS.md` lists each source and edit.


### 13.6 Pages for owners and staff

Served by `web` under `/shop`. Each page asks `shopAccess` itself; the frame around them is not the access check.

| Route | Purpose |
|---|---|
| `/shop` | Today: the day's figures (items out, due back, held on PayPal, claims to decide), what needs a decision, the handovers and returns at the counter with a line for now, the holds by where they stand, the month so far from the money log, and the latest audit lines. Until the shop is set up, its setup steps. |
| `/shop/rentals` | Every rental, newest first: who, items, period, fee, hold and where it stands, filtered by part of its life (`?show=`). The address of the shop's own page. |
| `/shop/rentals/new` | Booking at the counter or on the phone: dates on the shop's clock in the address, then a counter per item type up to what is free, the fee and hold as they add up, and an optional contact who is emailed the link. Needs PayPal connected and items. |
| `/shop/rentals/{id}` | One rental: its progress from booking to settlement, its terms, the hold at pickup, the handover of each item, the renter's link as a QR code or by email, and letting go of an unpaid booking. On a phone, what staff act on comes before the terms. |
| `/shop/rentals/{id}/handover/{session}` | One item's guided handover: each view photographed and checked on the phone, its marks confirmed or boxed, then sealed; the condition report's code once the rental is out. |
| `/shop/rentals/{id}/return/{session}` | One item's guided return, using the handover's saved plan and faint display-photo overlay. Required views must be present before sealing. Read-only members see evidence without capture controls. |
| `/shop/rentals/{id}/comparison/{comparison}` | Comparison progress, paired display photographs, findings and model/prompt identity. Staff can append a named manual inspection; read-only members cannot. A different shop's record or a different rental binding answers 404. |
| `/shop/items` | The item types, each with its terms, kit, photo plan and items, and where each item stands. Four figures on top: items, available, out now, in repair. Filters by standing, each its own address (`?show=`). |
| `/shop/items/new`, `/shop/items/types/{id}` | Creating and editing an item type, with its kit and its photo plan. The plan starts from the suggestion for the kind. |
| `/shop/items/{id}` | The item passport (section 9.4): where it is, its rentals, its known marks, its chain of photo sessions, its photo plan, its details and its status. Another shop's item answers 404. |
| `/shop/prices`, `/shop/paypal`, `/shop/staff`, `/shop/security` | The shop's settings |

- **One frame.** `app/[locale]/shop/layout.tsx` puts every shop page in the shop's frame (`features/shell`): a dark sidebar with the shop switcher, the menu, PayPal's state and mode, the language and theme, and the account menu. It is a rail of icons from `md` to `lg` and a top bar with a menu sheet below `md`. The public pages keep the site's header and footer through the `(site)` route group, which is not part of their address.
- **What the page reads.** `shopToday` in `packages/db` returns plain counts and rows. Where a hold stands (assured, valid, ending) and the order of the decisions come from `holdStanding` and `holdDay` in the domain. Times show on the shop's clock (`shopDay`), whoever reads them.
- **Rentals** and **Items** follow Today in the menu. **Holds and claims** join the menu after Rentals as their own pages are built with the spine.
- **After the extensions,** `/shop/calendar`, the rental calendar on Bryntum Scheduler, and `/shop/insights`, the owner's dashboard on AG Studio, join the menu. `extensions.md` section 12.5.

---

## 14. Infrastructure on AWS

### 14.1 Layout

Hold runs in the AWS account 707938860881, us-east-1, which it shares with Wick and CareCircle. It uses none of their resources. Every name starts with `hold`, every resource carries `project=hold`, and Hold has its own database cluster, buckets, user pool, queues, roles and image repository. Two things are shared because the account has only one of each: the CDK bootstrap stack, and the default VPC that Hold's database cluster sits in. The cluster has no public address and lets nothing connect to it over the network.

```mermaid
flowchart TB
    internet["Internet"]

    subgraph apprunner["AWS App Runner"]
        web["web service"]
    end
    worker["worker<br/>compute chosen with its code"]

    subgraph managed["Managed services, all Hold's own"]
        dataapi["RDS Data API"]
        aurora[("Aurora Serverless v2<br/>in the default VPC, no inbound access")]
        cognito["Cognito pool hold-staff"]
        s3e["S3 hold-evidence, Object Lock"]
        s3d["S3 hold-display"]
        sqs["SQS hold-* queues"]
        eb["EventBridge Scheduler group hold-schedules"]
        sm["Secrets Manager hold/*"]
        ses["Lambda hold-code-sender"]
        ecr["ECR hold-app"]
        bedrock["Claude on Amazon Bedrock"]
    end

    internet --> web
    web --> dataapi
    worker --> dataapi
    dataapi --> aurora
    web --> managed
    worker --> managed
    web --> internet
    worker --> internet
```

The CDK code is in `infra/`, as five stacks:

| Stack | Holds | Protection |
|---|---|---|
| `HoldData` | The Aurora cluster, its two logins, the evidence and display buckets | Termination protection. Every resource is retained if the stack is deleted |
| `HoldIdentity` | The Cognito pool `hold-staff` for owners and staff, its groups and its web client. Its codes go to the custom email sender `hold-code-sender`, a Lambda function, encrypted with the KMS key `alias/hold-code-key`, and out through the SMTP account in `hold/email/smtp`. The key and the secret are an administrator's. Cognito still names the SES identity `rogerjeasybavibidila@gmail.com`, verified outside the stack, which it requires but sends nothing through | Termination protection, deletion protection on the pool |
| `HoldWork` | The spine's queues and their dead-letter queues and alarms, the schedule group, the role the scheduler uses | |
| `HoldRegistry` | The image repository | Retained |
| `HoldWeb` | The App Runner service `hold-web`, its instance role and the role it pulls the image with, and a scaling limit of two instances. Its address is App Runner's own, https://p99faar3kp.us-east-1.awsapprunner.com, the stack's `ServiceUrl` output | Termination protection, because a new service would get a new address. Set once by an administrator, since the pipeline may not change it |

The worker's compute is added with its code. The web app's address is known only once the service exists, so it goes into `infra/cdk.json` as `webPublicUrl` after the first deploy, and the links in Hold's emails use it from the next one.

### 14.2 Containers

- **One Docker image** built from a multi-stage Dockerfile. The web app runs from it on App Runner.
- **The image is built for the processor architecture it runs on.** The image library ships different binaries for each architecture, so a mismatch fails at start.
- **Amazon ECR** stores the images in `hold-app`. A tag names one build and cannot be moved.
- **Docker Compose** runs web, worker and PostgreSQL together for local development.
- **No secrets in the image.** They are read from Secrets Manager at start.

### 14.3 Network

- **No network path to the database.** The cluster sits in the default VPC with no public address, and its security group has no inbound rules. Hold reaches it only through the RDS Data API, over HTTPS and authorized by IAM.
- **No VPC for the services.** App Runner calls PayPal, Bedrock and the AWS APIs directly over HTTPS, so there is no NAT gateway and no VPC connector.

### 14.4 Compute

| Service | Runs on | Notes |
|---|---|---|
| web | App Runner, 1 vCPU and 2 GB, one to two instances | Checked by TCP on port 3000. Runs the image named by the deploy, never the newest pushed |
| worker | Lambda, Node 24, 512 MB, four minutes per message | App Runner throttles CPU between requests, so it cannot poll queues. Five functions: `hold-worker-paypal-events`, `hold-worker-executions` and `hold-worker-upkeep` fed by their FIFO queues, `hold-worker-media` (1.5 GB, with sharp) fed by the standard `media` queue, each message read with its queue's schema and naming only the messages that failed so only those are tried again, and `hold-worker-outbox-relay` started every minute by EventBridge Scheduler. The worker makes schedules only in `hold-schedules`, hands them only the scheduler's role, and emails through Hold's SMTP login. The four minutes allow a paused Aurora cluster to wake. Each queue hides a message for six minutes, longer than a function may run on it. Code in `apps/worker`, deployed by `infra/lib/worker.ts` |

### 14.5 Data

- **Aurora Serverless v2,** PostgreSQL 17, one writer, with the RDS Data API switched on. The minimum capacity is zero while building, so the cluster pauses when idle, and is raised above zero for judging.
- **The database** is `hold_db`. Aurora reserves `hold`. While the cluster is paused, the first call fails with `DatabaseResumingException` until it resumes, so the adapter retries that error.
- **Two logins.** `hold_admin` runs migrations. `hold_app` is what the services use. It does not own the tables, so row-level security applies to it.
- **Backups** kept for seven days, with point-in-time recovery.
- **Encryption** at rest with the AWS-managed KMS key.
- **Migrations** run as a one-off step before each deployment.

### 14.6 Storage

| Bucket | Contents | Protection |
|---|---|---|
| **Evidence**, `hold-evidence-707938860881` | Original photographs, manifests, evidence packs | Object Lock in governance mode with 180 days' retention by default, versioning, KMS encryption, no public access, TLS only. Object Lock is switched on when the bucket is created. |
| **Display**, `hold-display-707938860881` | Smaller, face-blurred copies | KMS encryption, no public access, TLS only, served through short-lived signed links |

### 14.7 Queues and schedules

| Queue | Carries | Ordering |
|---|---|---|
| `paypal-events` | Stored event IDs to verify and apply | Per rental |
| `executions` | Approved actions on holds | Per rental |
| `upkeep` | A hold's timed steps, sent by its schedules. Deduplicated by content, since EventBridge Scheduler cannot name a deduplication ID | Per hold |
| `comparisons` | Sealed return sessions to compare | None needed |
| `media` | Display copies and face blurring. A standard queue, so messages carry no group or deduplication ID; a copy is made once whatever | None needed |
| `evidence` | Evidence packs to build | Per rental |
| `messages` | Emails and in-app messages | None needed |
| `ops-agent` | Operations agent runs | Per shop |
| `negotiations` | The advocates' turns on a contested claim | Per rental |

Every queue has a dead-letter queue and an alarm on it.

**Schedules:** hold replacement before validity ends, the charge of an unanswered claim before the hold lapses, hold expiry, return-due reminders, overdue alerts, reply-period end, the nightly reconciliation, the operations agent's run after it, and the expiry of unpaid bookings. Schedules for a hold are created when it is placed and removed when it ends.

### 14.8 Configuration

- Non-secret configuration is typed and validated at startup, in `packages/config`. A service with invalid configuration does not start, and the error names the settings that are wrong, never their values. The web app's settings are listed in `apps/web/.env.example`.
- Secrets come from Secrets Manager at startup and are never written to logs or images. The key that seals the sign-in cookie is `hold/web/cookie-key`, made by the HoldIdentity stack: the web app reads it by its ARN (`HOLD_COOKIE_KEY_SECRET_ARN`) and uses its SHA-256 as the key. Deployed, the app refuses a key given any other way. Renter links are signed with their own key, `hold/web/renter-link-key` (`HOLD_RENTER_LINK_KEY_SECRET_ARN`), which the worker reads too. The worker is told the web app's address (`HOLD_PUBLIC_URL`) for links in its emails. Both are told the photograph buckets (`HOLD_EVIDENCE_BUCKET`, `HOLD_DISPLAY_BUCKET`), and the web app the `media` queue. The evidence bucket takes a PUT only from the web app's own address (CORS).

---

## 15. Security

### 15.1 Threats and controls

| Threat | Control |
|---|---|
| **A shop overcharges a renter** | Charges only from findings with photographs. Prices only from the list the renter agreed to. Never more than the hold. A person's approval on record. The renter sees everything and can reply. |
| **Staff invent damage** | Every line needs a finding or a written reason. Claims above the limit need a second person. Approvals record what was changed. |
| **Evidence is altered afterwards** | Object Lock, fingerprints and the chain per item. |
| **A return is uploaded or sealed as a handover baseline** | Staff capture actions bind the session kind as well as shop scope. Returns keep the sealed handover plan; handover mark actions refuse return sessions. Negative cases are in `return-flow.test.ts`. |
| **A model response invents money or turns uncertainty into a charge** | Strict schemas contain price codes but no amounts, code resolves only agreed entries, a fresh second look checks damage, and uncertainty defers. The comparison has no PayPal dependency or action tool. Tested in `pipeline.test.ts`, `inspection.test.ts` and `job.test.ts`. |
| **A queue retry duplicates or replaces findings** | Atomic comparison creation with the return outbox, a bounded worker lease, terminal-state checks and stale-completion rejection. Tested in `return-repository.test.ts` and `job.test.ts`. |
| **Demonstration photographs pass as measured results** | Sample uploads retain a simulation marker; it propagates to the comparison and its audit line, and the staff screen discloses it. Reused photographs defer before model inference. Tested in `photo-taker.test.tsx`, `return-flow.test.ts`, `job.test.ts` and `returns.spec.ts`. |
| **A renter denies damage they caused** | The handover report they confirmed, and the dated photographs. |
| **A renter is blamed for old damage** | The item passport and the known-marks check. |
| **Someone guesses a renter's link** | Long signed tokens, expiry, scopes, and a one-time code for money decisions. |
| **A staff account is taken over** | Passwordless sign-in, a passkey before any change to prices, staff or PayPal, approval limits. Tested in `shop-access.test.ts`. |
| **An invitation is guessed, reused or forwarded** | A 32-byte random token, stored only as a fingerprint, valid once for seven days. The code goes to the invited address, and the role is given only if the proven address matches. Tested in `shop-setup.test.ts` and `sign-in-flow.test.ts`. |
| **Sample rentals pass for real ones** | Only the owner, only in a shop with no rentals, and once. Every sample rental is marked `simulated` in the record, its PayPal references start with `SIMULATED-`, its audit lines say so, and every screen marks it. No PayPal call is made. Tested in `shop-access.test.ts` and `shop-today.test.ts`. |
| **Codes are requested to pester someone or run up cost** | Five code emails per address and forty requests per network in fifteen minutes, on top of Cognito's own limits. Tested in `sign-in-flow.test.ts`. |
| **A sign-in code is read on its way to the person** | Cognito encrypts each code with Hold's own KMS key before handing it over. Only `hold-code-sender` may decrypt with it and only Hold's user pool may call it. The code and the address are never logged. Tested in `code-sender.test.ts` and `hold-app.test.ts`. |
| **The SMTP password leaks** | Kept only in the secret `hold/email/smtp`, readable by the code sender and the web app alone. No template, image, setting or log holds it. |
| **A shop's PayPal credentials leak** | Kept only in Secrets Manager, checked with PayPal before being kept, never shown again, never logged. |
| **Someone finds out who has an account** | Every address gets the same "check your email" step, and a code for an address with no account is simply wrong. Passkey sign-in gives every address options of the same shape, with no list of credentials. Tested in `sign-in-flow.test.ts` and `fake-identity.test.ts`. |
| **A passkey-proven record is carried to another account's session** | The record names the person and the session it belongs to, and is checked against the verified access token. Tested in `shop-access.test.ts`. |
| **Someone who reached an owner's inbox adds their own passkey** | Only the first passkey can be added from an emailed-code session. Every later one needs a session a passkey proved, checked on both halves of the registration. Tested in `passkey-registration.test.ts`. |
| **A sign-in attempt is altered or guessed** | The attempt travels in a cookie sealed with AES-256-GCM, so a changed one is refused. It lasts ten minutes and ends after three wrong codes. Tested in `sealed.test.ts`. |
| **A claim link is forwarded or a reply is replayed** | Signed, expiring rental-scoped links plus a link-bound, three-attempt, single-use payer-email code. Unknown fields and client amounts are rejected. Negative cases are covered in `claim-code-repository.test.ts` and `claim-flow.test.ts`. |
| **A deadline charges before the renter sees a claim** | Staff approval only creates the private link. A renter POST acknowledges review and starts the reply period; opening/reissuing a link never resets it. Tested in `claim-flow.test.ts`. |
| **A late replacement or conflicting waiver races settlement** | Reserve the hold before network calls, bind confirmation to the exact authorization, void unused late replacements, fence the human decision and retain pending resource IDs. Regression cases are in `return-settlement.test.ts`. |
| **An invoice is collected while a protected claim is still contested** | Defer invoice creation until acceptance, eligible uphold or an unanswered original deadline; preserve the contest/refund path after a protective capture. Tested in `return-settlement.test.ts`. |
| **A forged webhook** | Stored, then verified with PayPal against the shop's own subscription before anything in it is used; a rejected one is never applied. What it names is then read back from PayPal, and the event's body is never believed. Tested in `settle.test.ts` and `paypal-webhook.test.ts`. |
| **Made-up events fill the database** | Deliveries are limited per network and to 64 KB, and one PayPal event ID is stored once. |
| **The web app reads another shop's queued work** | Reading the outbox across shops is a function only `hold_worker` may call; the web app's role is refused. Tested in `paypal-event-repository.test.ts`. |
| **A replayed request** | Idempotency keys at every layer. |
| **One shop reads another's data** | Shop checks in the service and row-level security in the database. |
| **A photograph is swapped, corrupted or forged at upload** | The upload link signs the photograph's SHA-256, so S3 refuses any other file; the server records the SHA-256 S3 computed, not one the phone states; the key must be under the session and view; Object Lock keeps the original; column grants stop any service changing a fingerprint or key. Tested in `capture-repository.test.ts` and `handover-flow.test.ts`. |
| **The worker is compromised and forges a sign-in** | The worker reads the renter-link key, never the cookie key, so it can sign links but not seal a sign-in. Tested in `hold-app.test.ts`. |
| **A renter link leaks through the address bar** | Renter pages send no referrer and are not indexed. Each link is bound to one rental and its scopes, expires 60 days after the rental, and cannot move money without the renter approving in PayPal. |
| **Bookings are made to tie up a shop's items** | Bookings on a shop's page are limited to ten per network in fifteen minutes, and an unpaid booking keeps its items for fifteen minutes only. Tested in `booking-flow.test.ts`. |
| **A renter pays one rental with another's order, or a changed amount** | The fee is read from the rental, never from the renter. A capture is made only for the order this rental started, after PayPal shows it approved, and PayPal's captured amount must equal the stored fee or nothing is booked. Tested in `booking-flow.test.ts` and `booking-repository.test.ts`. |
| **Every server function skips a check** | Staff functions go through `shopAction`, renter functions through `renterAction`, shop-page functions through `shopPageAction`. A test fails on any export that does not. |
| **A row is tied to another shop's row by its id** | PostgreSQL checks a foreign key without row-level security, so a guessed id would pass it. Every repository function reads the row it refers to inside the caller's shop first, and answers "not found" when it is not there. Tested in `item-repository.test.ts` and `items.spec.ts`. |
| **A credential leaks** | Secrets only in Secrets Manager. Each service has its own minimal IAM role. |
| **A hold lapses unnoticed** | Hold upkeep, the at-risk state, alarms and reconciliation. |

### 15.2 Data protection

- **In transit:** TLS everywhere.
- **At rest:** KMS encryption in Aurora and both buckets.
- **Minimal data:** photographs of items, the renter's PayPal identity and contact email. No payment details are stored. PayPal holds those.
- **Faces:** blurred in every copy people see.
- **Logs:** no tokens, no credentials, no photograph contents. Personal details are masked.
- **Model calls:** photographs of items and the minimum text needed. No renter contact details.
- **Retention:** photographs are kept for the shop's stated period and the period a dispute could arise, then removed. Object Lock retention is set to match.

---

## 16. Reliability and failure handling

| Failure | What Hold does |
|---|---|
| **The hold is declined** | The rental stays awaiting hold. The renter is told plainly and can try another funding source. The item is not handed over. |
| **A PayPal call times out** | Marks the execution unknown, reads the resource from PayPal by its identifier, waits for the event. Never assumes. |
| **A capture fails** | Falls back to an invoice with the evidence pack, releases the hold and tells the owner. There is no second renewal to retry with. |
| **A renewal fails** | Marks the hold at risk and tells the owner. The capture is still attempted on the original identifier. |
| **A hold expires** | Marks it expired, tells the owner at once, and offers an invoice path for any later claim. |
| **A webhook is missed** | Nightly reconciliation finds and applies it. |
| **A webhook arrives twice or out of order** | Duplicate IDs are ignored. State machines only move forward. |
| **An upload fails on weak wifi** | The phone retries. A session cannot be sealed until every required photograph is confirmed stored. |
| **Claude is unavailable** | The return session is still sealed and stored. Staff are told the comparison is delayed and can inspect by eye. The hold stays in place. |
| **The comparison cannot decide** | The result is "needs a person". Nothing is charged on an uncertain finding. |
| **Rekognition is unavailable** | Display copies are held back until faces can be blurred. Originals are unaffected. |
| **A worker crashes mid-job** | The message returns to the queue. Idempotency makes the retry safe. |
| **A message keeps failing** | It moves to the dead-letter queue and raises an alarm. |
| **A deployment goes wrong** | Rolling deployment with health checks rolls back automatically. |

**The governing rule:** when Hold is unsure whether money moved, or unsure whether damage occurred, it stops, finds out and tells a person. It never charges on a guess.

---

## 17. Observability and audit

### 17.1 Logs, metrics and alarms

- **Structured logs** from both services, each line tagged with the shop, the rental, the hold, the execution and PayPal's debug ID.
- **A correlation ID** follows one piece of work from the first request through every queue.

| Metric | Why |
|---|---|
| Holds by state | The health of the whole system at a glance |
| Holds at risk or expired | Should be near zero |
| Time from return to release | The renter's experience |
| Time to complete a comparison | The counter's experience |
| Comparison outcomes: clean, findings, needs a person | Shows how often the system defers |
| Disagreements between the two looks | Shows comparison stability |
| Claims accepted, contested, reduced | Shows whether evidence convinces |
| Captures by outcome | Shows charges are succeeding |
| Number guard rejections | Shows how often the model strays |
| Reconciliation differences | Should be zero |
| Dead-letter queue depth | Should be zero |
| Model cost per comparison | Keeps running costs known |

**Alarms** on any hold that expires, any hold at risk for more than an hour, any execution unknown for more than a few minutes, any reconciliation difference and any dead-lettered message.

### 17.2 The audit trail

For any charge, Hold can show:

1. The rental and the price list version the renter agreed to.
2. The handover photographs and the report the renter confirmed.
3. The return photographs.
4. Each finding, with both looks and their confidence.
5. Who approved the claim and what they changed.
6. What the renter was shown and how they replied.
7. The request sent to PayPal and its identifier.
8. The PayPal event that confirmed it.
9. The fingerprints proving the photographs are unchanged.

---

## 18. Performance and scale

**For the hackathon,** load is a few demo shops and occasional judge visits.

**Targets to measure against**

| Step | Target |
|---|---|
| Photo quality check on the phone | Feels instant |
| A full handover session | Under one minute |
| Comparison of one item | Within the time staff take to greet the renter |
| Release after a clean return | Seconds after staff confirm |

These are targets, not measured results.

**Where it would be stressed first, and the answer**

| Pressure | Answer |
|---|---|
| A busy morning of returns | Comparisons are queued and workers scale on queue depth |
| Large photographs on slow wifi | Direct upload to S3 with retry. Display copies generated later. |
| Model cost per comparison | Candidate regions limit what is sent as close crops. The second look runs only on damage findings. |
| Many shops | Every table is scoped by shop. Queues are ordered per rental, not per shop. |
| Photograph storage growth | Lifecycle rules move older evidence to cheaper storage and remove it at the end of retention |

---

## 19. Testing

| Level | What is tested | How |
|---|---|---|
| **Domain** | State machines, claim arithmetic, approval rules, upkeep planning | Unit tests and property-based tests. No database, no network. |
| **Adapters** | PayPal mapping, webhook verification, event handling | Tests against recorded PayPal responses |
| **Integration** | A full flow through the database and queues | A real PostgreSQL (PGlite, in the test process) and a fake PayPal |
| **Sandbox** | Real calls: authorize, capture, void, refund | Run on demand and before release |
| **Negative** | Declines, failed captures, voided holds | PayPal's mock-response header, which covers orders, captures and voids |
| **Renewal** | Reauthorization and expiry | A fake PayPal with a controllable clock, because the sandbox cannot simulate these |
| **End to end** | Handover, return, claim, reply | Playwright, with a recorded image as the camera |
| **Comparison** | Accuracy of findings | The evaluation set in section 10.8 |
| **Evidence** | Lock, fingerprints, chain | Tests that try to alter stored evidence and must fail |
| **Security** | Isolation between shops, renter link scope | Tests that try to cross those boundaries and must fail |
| **Agents** | That no tool, proposal kind or mandate leads to a charge a claim does not justify | Tests that list every one and must find none |
| **Detectors** | Each exception is found once, and only when its condition is true | Seeded states and property tests |
| **Referee** | No settlement outside either side's limits, and every negotiation ends | Property tests over any sequence of moves |
| **Ladder** | A hold is never raised, and never rises with more clean returns | Property tests |
| **Manipulation** | Text from renters, assistants and PayPal memos cannot steer an agent into an action | Seeded hostile text |

**Properties the domain tests assert for any input**

- A hold reaches exactly one final state.
- The amount captured never exceeds the reserved amount or the approved claim.
- Applying the same event twice changes nothing.
- No sequence of events can move a record backwards.
- A charge at any moment within the 29 days, on a hold not yet renewed, is assured: it captures inside the assured period or renews first.
- An unanswered claim is always charged before the hold lapses.

---

## 20. Environments, deployment and demo mode

### 20.1 Environments

| Environment | Purpose | PayPal |
|---|---|---|
| **Local** | Development with Docker Compose. A tunnel for webhooks. | Sandbox |
| **Test** | Automated tests in continuous integration | Fake, plus the simulator |
| **Demo** | The hosted environment judges use | Sandbox |

### 20.2 Deployment

**Participant deferral, 20 October 2026:** Deployment and live AI accuracy evaluation remain outstanding and will be done later. Continue local implementation and verification of the essential spine. This records a deliberate deferral, not a successful deployment or an accuracy result.

1. Every pull request and every push to main runs **CI** (`.github/workflows/ci.yml`): lint, type-check and the unit tests (`pnpm check`), the end-to-end suite against the in-process fakes, and a build of the container image. CI needs no AWS access and no secret.
2. Once CI passes on main, **Deploy** (`.github/workflows/deploy.yml`) runs. It can also be started by hand.
3. Database migrations run through the Data API as `hold_admin` (`pnpm --filter @hold/db migrate:aurora`).
4. The image is built and pushed to ECR, tagged with the commit. Tags are immutable.
5. The CDK shows its diff, then deploys every stack, passing the commit as `webImageTag`.
6. App Runner rolls `hold-web` forward to that commit's image, with health checks, and CloudFormation rolls back if it does not start.

GitHub signs in to AWS through OpenID Connect as `hold-github-deploy`, made by the HoldDelivery stack. Only a workflow on the main branch of `rogerjeasy/hold` can take it, named by GitHub's immutable subject (owner and repository ids as well as names), so a renamed or recreated repository does not match. The account is shared, so nothing the pipeline holds reaches beyond Hold:
- It never takes the account's CDK bootstrap roles, which could deploy any stack. Hold's stacks are synthesized with the caller's own credentials and keep their templates under `hold/` in the bootstrap bucket, the only prefix it may list.
- It may change only the five resource stacks (`HoldData`, `HoldIdentity`, `HoldWork`, `HoldRegistry`, `HoldWeb`), through change sets that CloudFormation carries out as `hold-cloudformation-exec`.
- That CloudFormation role manages Hold's resources and reads none of their contents: no objects, messages, user accounts or credentials, except the database logins' secrets, which attaching the cluster needs. The only objects it reads are its own templates and function code under `hold/` in the bootstrap bucket. It manages Lambda functions named `hold-*` and KMS keys that already carry `project=hold`, and never decrypts with one. It cannot make or tag a key, because tagging a key as it is made would let it tag another project's key too. Hold's one key, `alias/hold-code-key`, was made by an administrator, and setting it on the user pool, which makes Cognito's grant, is all the role may do with it. That grant may go only to Cognito and only to encrypt, so no grant the role makes can let anyone, itself included, decrypt a code. Security groups and user pools are reached by the `project=hold` tag, which may be set only while one is created and never changed after.
- Every role it makes must carry the `project=hold` tag and `hold-permissions-boundary`, and it changes only roles that carry the tag. It can neither remove the boundary nor the tag, and can hand on only the web app's two roles, `hold-web` and `hold-web-access`, which trust App Runner alone, and the code sender's, `hold-code-sender`, which trusts Lambda alone. It creates an App Runner service only with the `project=hold` tag, and changes only services named `hold-*`. The boundary caps any Hold role at exactly what the app uses: sending and reading Hold's queues, reading and writing objects, reading Hold's secrets and keeping the shops' PayPal credentials, the database through the Data API, its schedules, its image, sending email, Claude on Bedrock, its own logs, putting a person in a group of its user pool, and decrypting with Hold's own keys. The only role a Hold role may hand on is the scheduler's, to the scheduler.
- **What remains.** A template on main can still give a Hold role a trust policy naming another principal; the boundary keeps such a role to Hold's own resources. Main is where Hold's code comes from, so whoever can change it can already change what the app does with Hold's data.
- HoldDelivery itself, with both roles and the boundary, is deployed only by an administrator, so a commit on main cannot widen what the pipeline may do.
- Beyond deploying, the pipeline may push to `hold-app` and run statements on `hold-database` with the two database secrets. No AWS key is stored in GitHub. The ARNs it needs are repository variables, which hold no secret.

**The image** (`Dockerfile`) is the web app's standalone build, run by `apps/web/serve.ts` instead of the server.js Next.js generates. That server names a host, and then treats each language rewrite as a request to another site, which loops. `serve.ts` starts it the way `next start` does.

### 20.3 Demo mode

Judges have no bike to photograph and cannot wait four days for a hold to age.

- **A seeded shop** with items, a price list, a wear policy, an owner, a staff member and a sandbox renter.
- **Sample photo sets** built in: a clean return, a return with a scratch, and a return that leads to a contested claim. One tap loads a set in place of the camera. The rest of the flow, including every PayPal call, is real.
- **The real camera path** also works, on any object a judge has to hand.
- **Renewal and expiry.** PayPal allows renewal only from the fourth day, so it cannot be shown on a hold placed during the demo. The demo shows the upkeep plan for each hold and marks any simulated renewal as simulated.
- **Honest labelling.** Anything simulated is marked as simulated on screen and in the record.
- **Reset.** One command returns the shop to its starting state.
- **Sample rentals in any shop.** While a shop has no rentals, its owner can add eleven sample rentals from the Today page (`addSampleRentals` in `features/shop/actions.ts`, built in `packages/db/src/sample-rentals.ts`). They use the shop's published price list, so a price list must come first. Every rental is marked `simulated`, every PayPal reference starts with `SIMULATED-`, every audit line carries `simulated: true`, and the page says so. Today's handovers and returns are set from the moment they are added, so the day reads the same at any hour. Only the sandbox exists today; a live mode must refuse sample rentals.
- **For the extensions.** The seeded renter has a history of clean returns, so the trust ladder can be seen. A seeded contested claim can be settled by two advocates. The morning queue is seeded with one case for each detector. A hosted assistant uses the same MCP server as any outside assistant, so a judge needs no MCP client.

---

## 21. Decision record

| # | Decision | Alternatives considered | Reason |
|---|---|---|---|
| 1 | The hold is its own authorization, separate from the fee | One order with two purchase units | PayPal does not allow an authorize-first order with more than one purchase unit. A separate hold also has a clean, fully documented life. |
| 2 | Three placement strategies behind one interface | One fixed way to place a hold | Advance bookings, walk-ins and returning renters have different needs, and a hold lasts only 29 days. |
| 3 | Place the hold close to pickup | Place it at booking | A hold placed weeks ahead would be nearly spent on arrival. |
| 4 | Renew only at the moment of charging, and capture on the new identifier at once | Renewing every three days; renewing shortly before the expected return; renewing as soon as damage is found | PayPal allows one renewal. Each alternative spends it on a guess, and a late return or the reply period then pushes the charge outside its three days. Renewing at the charge makes every charge within the 29 days assured, and clean returns never renew. Decided 14 October 2026. |
| 5 | Never capture above the held amount | Use PayPal's allowance to capture slightly more | The renter agreed to a stated amount. Anything more goes by invoice. |
| 6 | Webhooks plus read-back as the source of truth | Trusting API responses | A response can be lost. The event and the resource cannot both lie. |
| 7 | Hold tracks expiry itself | Waiting for PayPal to report it | PayPal's event list has no expiry event. |
| 8 | An append-only money log, not a double-entry ledger | A full ledger | Hold never holds a balance. It records what PayPal did. A ledger would add complexity without adding truth. |
| 9 | Classical image steps before the model | The model alone | Alignment and difference-finding are precise. The model judges what the differences mean. |
| 10 | A second, independent look on every damage finding | One model call | A wrong damage finding is the worst error. An independent check is the cheapest strong defense. |
| 11 | Prices read from the database | Prices proposed by the model | A renter must never be charged an invented amount. |
| 12 | Locked storage, fingerprints and a chain per item | Ordinary storage | Evidence that could have been altered convinces nobody. |
| 13 | Two copies of each photograph | One copy | The original must stay untouched. The copy people see must protect bystanders. |
| 14 | No renter accounts | Sign-up for renters | A visitor renting for an afternoon will not create an account. |
| 15 | The assistant can propose a release but not a charge | Full control by conversation | Returning money is low risk. Taking it must begin from evidence. |
| 16 | Per-shop roles in the database, not in Cognito | Cognito groups for everything | One person can work in several shops with different limits. |
| 17 | A mandate is an approval given in advance, with typed limits checked by plain code | Approval at the moment only. Or agents trusted to stay in bounds. | People cannot be present for every step. An agent's own word that it is allowed is worth nothing. |
| 18 | Detectors in plain code find what needs attention. The agent explains and proposes. | Let the agent look for problems | A lapsing hold must never be missed because a model overlooked it. The queue is complete even with no model. |
| 19 | PayPal's MCP server is reached from Hold's own client, behind the gateway | The model provider's connector. The toolkit's framework adapters. | Every call is checked and logged in one place, and the shop's PayPal token stays inside Hold. |
| 20 | The comparison's accuracy is published from a half of the set that tuning never sees | Internal testing only. One set for both. | A number tuned on its own test proves little. A published number can be held to account. |
| 21 | Trust only ever lowers a hold | A score that raises or lowers it | Nobody is penalised for who they are. A new account gains nothing. No model judges a person. |
| 22 | A renter's assistant is identified by the PayPal payment, with a token passed as a tool argument | A sign-in for the MCP server | Renters have no account. Any MCP client can use it with no setup. |
| 23 | Two advocates exchange itemized offers under a referee in plain code | Private bids split down the middle. One model acting as mediator. | A split gives a number with no reasons. Hold's product is a claim where each line traces to a photograph. |
| 24 | Damage agreed during a rental is charged at the return, in the one final capture | Take part of the hold at once | It uses only PayPal behavior the spine already depends on, and a named person still sees the item first. |
| 25 | Hold's own sign-in and sign-up pages, calling Cognito | Cognito's managed pages | The pages keep the site's design, its four languages and its header. They can also tell staff and renters, who do not sign up, where they belong. Cognito still holds the users and issues the tokens. |
| 26 | Hold's own resources in an AWS account shared with Wick and CareCircle | Reusing their database, user pool or table, with Hold's data kept apart inside them | Nothing Hold stores can be read through, or lost with, another project. Names, tags and stacks make Hold's part of the account plain. |
| 27 | The web app on App Runner | ECS Fargate behind a load balancer | No load balancer, NAT gateway or VPC to run and pay for through judging. The trade is that App Runner cannot run the worker. |
| 28 | The RDS Data API between the services and Aurora | A VPC connector with a NAT gateway or instance | The database accepts no network connections, and App Runner keeps direct internet access for PayPal. Each statement takes some tens of milliseconds longer. |
| 29 | Hold's own Aurora cluster | A `hold` database inside CareCircle's cluster | CareCircle's own Terraform could change or remove that cluster before judging ends. |
| 30 | Columns with a fixed list of values are text with a check constraint | PostgreSQL enums | The RDS Data API sends every string parameter as text, and PostgreSQL will not compare an enum with text. Every insert and every filter on an enum column would need a cast. The values still come from the domain's lists. Found against Aurora on 14 October 2026. |
| 31 | A passkey with user verification as the second factor | An authenticator app, as first planned | Cognito allows an authenticator app only after a password. A person who turned one on could no longer sign in with an emailed code. Found in Cognito's documentation on 14 October 2026. |
| 32 | Rate limits counted in Aurora, by fingerprint | Counting in memory; a separate store | App Runner may run more than one instance, so a count in memory would not hold. Aurora is already there. |

---

## 22. Risks, assumptions and open questions

### 22.1 Assumptions the design depends on

- A sandbox business account can authorize, capture part, release and renew.
- After a final capture for part of a hold, the remainder is released.
- The comparison can tell real damage from wear, dirt and lighting often enough to be useful, with people handling the rest.

The first two are confirmed by short trials on day one. The third is confirmed only by the evaluation set. The second was confirmed in the sandbox on 14 October 2026 (`tech-stack.md` section 16, item 1).

### 22.2 Open questions

| Question | Why it matters | Affects the hackathon |
|---|---|---|
| **Does the "combined" strategy work?** | Partly answered: the sandbox confirmed on 14 October 2026 that the remainder survives a partial capture and can be captured or released. Renewal after a partial capture is tried after day 4. | Yes. If renewal fails, combined holds are limited to short rentals. |
| **What runs the worker?** | Settled on 15 October 2026: Lambda functions fed by SQS (section 14.4). App Runner throttles CPU between requests, so it cannot poll queues or run scheduled work. Comparisons that run for minutes fit Lambda's 15-minute limit. | No |
| **Is SES out of its sandbox?** | Settled another way: email goes through Hold's SMTP account, so SES's sandbox no longer limits who receives a code (`tech-stack.md` section 9.1). | No |
| **How accurate is the comparison in a real shop?** | Outdoor light, wet or dirty items and hurried photographs will all test it. | Yes. It decides how much is automatic and how much goes to a person. |
| **How does Hold act on a real shop's PayPal account?** | Holding a shop's API credentials is not acceptable in production. PayPal's partner model is the likely answer. | No |
| **Will shops be approved for saved payment methods?** | The "saved method" strategy needs it in production. | No, it is optional |
| **How are rentals longer than 29 days protected?** | They need a replacement hold, which needs the renter or a saved method. | No, but the design covers it |
| **What do consumer protection rules require** for holds, damage charges and the right to reply, in each country? | Decides reply periods and wording. | No |
| **How long may photographs be kept?** | Sets Object Lock retention. | No |
| **Is Pay Later offered on these orders?** | It may not be available when an order authorizes first. | No, it is optional |

### 22.3 Risks

| Risk | Likelihood | Effect | Mitigation |
|---|---|---|---|
| The comparison misses small damage | Medium | Shops lose trust | Guided angles, the handover ghost, candidate regions, and staff can always add a line with a reason |
| The comparison flags clean returns | Medium | Renters lose trust. The worst outcome. | The second look, cautious thresholds, deferral to a person, and human approval on every charge |
| A hold lapses during a rental | Low | The shop is unprotected | Upkeep schedules, the at-risk state, alarms, reconciliation and the invoice fallback |
| Phone cameras behave differently across devices | Medium | Poor photographs | Quality checks on the phone, early testing on iPhone and Android |
| A sandbox behavior differs from the design | Medium | A flow must change | Day-one trials and the baseline strategy that uses only plainly documented behavior |
| The demo environment fails during judging | Low | Judges cannot test | Alarms, automatic rollback, a reset script and a recorded walkthrough |
| The extensions crowd out the spine | High | No working product | The gates and the stop line in `extensions.md` section 12 |

The extensions' own risks and open questions are in `extensions.md` section 14.

### 22.4 The essential spine

If time is short, these parts alone make a complete product: placing a hold at the counter, guided handover, guided return, the comparison with its second look, the claim screen with approval, capture and release, and the evidence pack. Everything else can follow.

**After the spine,** the extensions are built in the order set out in `extensions.md` section 12: the accuracy scorecard, the operations agent, the Clean Record, renting through an assistant, the advocates, and the incident desk. Then the two sponsor surfaces in its section 12.5. None starts before the spine runs end to end.

---

## 23. How certain each part is

**Checked against PayPal's documentation during this work**

- A hold is valid for 29 days, with a three-day period in which capture is best assured.
- A hold can be renewed after the three-day period and within the 29 days. The renewal gives a new identifier and a new three-day period. The sandbox says only once, which corrects the earlier reading that it could be repeated.
- A capture can be for less than the held amount, and can be marked as final or not final.
- A fully captured hold cannot be voided.
- An authorize-first order cannot have more than one purchase unit.
- The endpoints for showing, capturing, renewing and voiding a hold, and for refunding a capture.
- The dispute endpoints, including providing evidence, and the two sandbox-only test endpoints.
- The webhook event names used here, and that the list contains no hold-expiry event.
- Webhook verification and PayPal's retry behavior.
- PayPal's mock-response header for sandbox error testing covers orders, captures and voids, and does not list renewal.
- Saving a PayPal wallet for later charges, and its approval requirement.
- The Agent Toolkit's tool list.

**Confirmed in the sandbox**

- That a final capture for part of a hold releases the remainder, and that the hold then refuses further captures and voids. 14 October 2026.
- That a hold can be captured as final or voided after a non-final partial capture. 14 October 2026.

**Written from general knowledge and to be confirmed**

- That a hold can be renewed after part of it has been captured. If it cannot, a walk-in hold charged after day 3 captures without assurance, as section 7.4 already allows.
- That a capture after the assured period succeeds on a hold that was never renewed. The fallback in section 7.4 depends on it. Trial 3, hold G.
- That a sandbox account allows more than one capture on a hold without special setup.
- The accepted formats and size limits for dispute evidence.
- AWS specifics: S3 Object Lock and upload checksums, Rekognition face detection, Aurora's pause behavior and Cognito's sign-in options.
- That OpenCV.js runs fast enough on a phone and gives usable alignment on the worker.

**Not yet tested**

- Apart from the PayPal adapter in `packages/paypal` and the sandbox trials, nothing in this document has been built or run. The comparison's accuracy is unknown until the evaluation set exists. The timing figures are targets.
