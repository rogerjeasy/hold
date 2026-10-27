# Hold: technology stack

Recommended tools and services for building Hold for the PayPal AI Hackathon 2026. Draft 2, 13 October 2026.

This document says what to build with and why. It is not a design or an implementation plan. See `project-description.md` for the product. The architecture document will follow this one. The extensions specified in `extensions.md` add a few tools, which are included below.

**Where it runs:** the AWS account 707938860881 in us-east-1, which Hold shares with two other projects, Wick and CareCircle. Hold creates its own resources there and uses none of theirs. Every name starts with `hold`, everything carries the tag `project=hold`, and no data store is shared (`architecture.md` section 14).

---

## 1. The stack at a glance

| Layer | Choice |
|---|---|
| Language | TypeScript everywhere |
| Web app | Next.js, React, Tailwind CSS, shadcn/ui, installable to the home screen |
| Camera capture | Browser camera with guided overlays |
| Instant photo checks | OpenCV.js in the browser |
| Owner dashboard | AG Studio from AG Grid, with custom widgets and the Studio Agent Framework |
| Rental calendar | Bryntum Scheduler |
| Checkout | PayPal JavaScript SDK v6 |
| PayPal server side | Direct REST calls for the hold lifecycle, plus the Agent Toolkit and sandbox MCP server |
| AI model | Claude Opus 4.6 on Amazon Bedrock (`us.anthropic.claude-opus-4-6-v1`), through the Anthropic Bedrock SDK, for building and judging. Designed for Opus 5.5, which the account has no quota for (section 6) |
| Agent interfaces | An MCP server for renters' assistants and an MCP client for PayPal's server, both built with the MCP TypeScript SDK (`@modelcontextprotocol/sdk`) |
| Image processing | sharp on the server, OpenCV.js for alignment |
| Containers | Docker, one image for both services, Docker Compose locally |
| Compute | AWS App Runner for the web app. The worker's compute is chosen with its code (`architecture.md` section 22.2) |
| Database | Amazon Aurora Serverless v2, PostgreSQL-compatible |
| Authentication and authorization | Amazon Cognito for owners and staff, signed links for renters |
| Photo storage | Amazon S3 with Object Lock |
| Face blurring | Amazon Rekognition |
| Background work | Amazon SQS and EventBridge Scheduler |
| Email | Hold's SMTP account (a Gmail account with an app password), through `nodemailer`. Cognito hands its codes to Hold's own sender |
| Secrets | AWS Secrets Manager |
| Signing | An asymmetric key in AWS KMS, for the Clean Record credential |
| Infrastructure as code | AWS CDK in TypeScript |
| Build and deploy | GitHub Actions, Amazon ECR |
| Monitoring | Amazon CloudWatch |
| Tests | Vitest, Playwright with a simulated camera and axe accessibility checks, PayPal negative testing, a photo evaluation set |
| Workspace tooling | pnpm workspaces on Node.js 24, TypeScript 6.0 in strict mode, ESLint with typescript-eslint strict type-checked rules |

**How Hold differs from Kin.** Hold has no voice and no phone calls, so it needs two services, not three. Its hard problems are different: the exact lifecycle of a PayPal hold, and reliable comparison of two photographs.

---

## 2. What the hackathon requires

- **Required:** the PayPal developer platform in the free sandbox, and an AI tool, model or platform of your choice. PayPal must be central to the project.
- **Optional:** sponsor tools from AG Grid, APIMatic, Astropods, Bryntum, Channel3, Elastic, KERNEL, Postman, Render and Zapier.
- **Not restricted:** language, framework, database and hosting.
- **Submission needs:** a public open-source repository with a visible license, a working build that judges can reach free of charge until 15 December 2026, and a video under three minutes.
- **Dates:** submissions close on Thursday 12 November 2026 at 12:00 pm Pacific Time. Judging runs from 1 to 15 December 2026.
- **Prizes:** a project can win one Grand Prize or one Honorable Mention, plus one Sponsor Prize.

---

## 3. How the pieces fit

```
   Owner (laptop)        Counter staff (phone)        Renter (phone, no account)
        |                        |                              |
        +------------------------+------------------------------+
                                 |
                    App Runner public URL (HTTPS)
                                 |
              +------------------+------------------+
              |                                     |
         web service                           worker service
         Next.js UI and API                    photo comparison, hold upkeep,
         PayPal webhook intake                 webhook processing, evidence packs
         (App Runner)                          (compute chosen with its code)
              |                                     |
   +----------+----------+-----------+--------------+-----------+
   |          |          |           |              |           |
 Cognito   Aurora      S3 with      SQS        EventBridge   Secrets
 owners    Serverless  Object Lock  queues     Scheduler     Manager
 and staff v2          photos and
                       evidence

 External services:   PayPal sandbox   |   Claude on Amazon Bedrock   |   Amazon Rekognition
```

Two services share one codebase:

- **Web** serves the app and its API, runs the guided photo sessions and receives PayPal webhooks.
- **Worker** compares photographs, keeps holds valid, applies PayPal events, builds evidence packs and sends notifications.

---

## 4. Frontend

- **Next.js with React and TypeScript.** One app serves the owner on a laptop and the staff and renter on a phone.
- **Tailwind CSS and shadcn/ui.** Large touch targets and a counter routine that works one-handed.
- **Installable web app.** Staff keep Hold on the phone's home screen. Renters install nothing and arrive by a link.
- **Languages.** Renters are often visitors. The interface uses `next-intl` for fixed text, and claim messages are written in the renter's language. The fixed text exists in English, Spanish, French and German, in `apps/web/messages`. English is the default. A test fails if a language is missing a key or a placeholder.
- **Light and dark themes.** The page follows the device setting, and a switch in the header overrides it. `next-themes` sets the theme before the first paint, so there is no flash. It is the one dependency added beyond this list, because the alternative is a hand-written inline script doing the same job.
- **Design tokens.** Colors, type sizes, radii and widths are named once in `apps/web/src/app/globals.css` and used through Tailwind. Each theme has its own palette, chosen by hand and checked for contrast in both. Components use token names, never raw color values.
- **QR codes.** `qrcode` draws the renter's link as SVG on the server, for the renter to scan at the counter. It is the second dependency added beyond this list: a QR encoder by hand is several hundred lines of error correction for no gain.
- **Type.** Archivo for headlines and text, JetBrains Mono for small labels and amounts. Both are served from the app itself through `next/font`.
- **Components.** shadcn/ui on the Radix primitives. Buttons are at least 44 pixels tall. Shared primitives live in `src/components/ui`, the header and footer in `src/features/site`, the public pages in `src/features/marketing`, and sign-in and sign-up in `src/features/auth`.
- **Language routing.** Next.js 16 root parameters carry the language. The older `setRequestLocale` call is deprecated in `next-intl` and is not used.

### 4.1 Guided photo capture

This is the screen staff use most, so it gets the most care.

- **Browser camera** through the standard media API, using the rear camera at the highest resolution the phone allows.
- **A framing outline** for each required view, so every photograph of a given item type is taken from the same angle.
- **A ghost of the handover photograph** shown faintly during the return session. Staff line the item up with it. Matching angles is the single biggest help to an accurate comparison.
- **Instant quality checks on the phone,** before upload, using OpenCV.js (`@techstark/opencv-js` 4.12, loaded in a Web Worker on the handover screen only): sharpness, shadows and highlights, and whether the item fills the frame. A poor photograph is caught while retaking it takes two seconds. The thresholds in `PHOTO_QUALITY` are starting values, to tune on the evaluation set.
- **Direct upload to S3** through short-lived signed links, with a progress indicator and retry for weak shop wifi.

### 4.2 Owner screens

- **Bryntum Scheduler** for the rental calendar: items down the side, time across the top, bookings as bars. This is the natural picture of a rental business and shows availability, overdue returns and holds nearing expiry at a glance. Each bar carries flags from the PayPal state of its rental, and the operations agent proposes moves when a booking is blocked. `extensions.md` section 12.5.
- **AG Studio** from AG Grid for the owner's insights dashboard: money on hold, what was captured and released, damage and recovery, built from Hold's own records with custom widgets in Hold's theme. An insights agent on the Studio Agent Framework builds and edits widgets on request, with read access only. `extensions.md` section 12.5.
- Lists such as holds, claims, the morning queue and the trust ledger are plain lists, which become card lists below `md`.
- Both are built after the six extensions.

---

## 5. PayPal

| Hold feature | PayPal product | How Hold reaches it |
|---|---|---|
| The rental fee is paid | Orders v2, capture | JavaScript SDK v6 in the browser, REST on the server |
| The deposit is reserved as its own hold | Orders v2 with intent to authorize | PayPal approval by link or QR code, REST on the server |
| A clean return releases it | Void of the authorization | Direct REST |
| Damage is charged | Partial capture | Direct REST |
| A longer rental keeps its protection | Reauthorization | Direct REST |
| A returning renter | Vault payment token | Direct REST |
| Damage beyond the hold | Invoicing v2 | Agent Toolkit |
| A claim is reduced after review | Refunds | Agent Toolkit |
| Shipped rentals | Shipment tracking | Agent Toolkit |
| A renter disputes a charge | Disputes, with evidence upload | Agent Toolkit to read, direct REST to upload evidence |
| The true state of every payment | Webhooks and Transaction Search | Webhook endpoint, Agent Toolkit |
| Owner signs up | Log in with PayPal | Direct OAuth exchange |
| The owner's assistant | Agent Toolkit and sandbox MCP server | Read tools only |
| Rental fee spread over time | Pay Later | JavaScript SDK v6, where offered |
| The operations agent's overnight checks | Transactions, insights, disputes, invoices and tracking | Sandbox MCP server, read tools only, through Hold's own MCP client |
| A booking made by a renter's assistant | Orders v2, with PayPal's approval link | Direct REST, with the `CHECKOUT.ORDER.APPROVED` event as a backstop |
| A smaller hold for a trusted renter | Orders v2 with intent to authorize, for the ladder's amount | Direct REST |
| A settlement agreed by two advocates | Partial capture as the final capture | Direct REST |

**Packages and endpoints**

- PayPal REST APIs called directly for the hold lifecycle: Orders v2 and Payments v2.
- `@paypal/agent-toolkit` for invoices, refunds, tracking, dispute reading and transaction data.
- The hosted sandbox MCP server at `https://mcp.sandbox.paypal.com`, with `/sse` and `/http` transports, for the owner's assistant.
- PayPal JavaScript SDK v6 in the browser.

**The hold lifecycle is not in the Agent Toolkit.** The toolkit's payment tools create an order, read it, capture it and refund it. It has no tool to authorize, partially capture, void or reauthorize. Those calls are the core of Hold, so they go directly to the REST API. This suits the product, because each of them must sit behind Hold's own approval record.

**How Claude reaches PayPal's tools.** The toolkit's pages list adapters for the Vercel AI SDK, the OpenAI Agents SDK, LangChain, Amazon Bedrock and MCP. They list none for the Anthropic SDK. Hold therefore connects its own MCP client to PayPal's sandbox MCP server, keeps only the read tools on its allowlist, and offers them to Claude through Hold's tool gateway. The shop's PayPal token stays inside Hold, and every call is logged. Tool names are matched against what the server lists, because PayPal's pages spell some of them differently.

**Facts about PayPal holds that shape the product**

- A hold reserves funds for up to 29 days.
- Capture is best assured in the first three days. After that, Hold renews the hold at the moment it charges, so the capture falls inside the renewal's own three days (`architecture.md` section 7.4).
- A renewal issues a new authorization identifier, and later captures must use it.
- A hold can be renewed only once, from day 4 to day 29. This is PayPal's own wording in the sandbox, confirmed on 14 October 2026.
- A capture can be for less than the held amount.

**Rules for every PayPal call**

- **Webhooks are the source of truth.** A hold is recorded as placed, captured or released only when PayPal says so. Every webhook signature is verified.
- **Every write carries an idempotency key,** so a retry never captures twice.
- **Every capture sits behind a named person's approval** in Hold's own database.

**The shop's PayPal account.** Each shop is paid into its own PayPal business account. In the hackathon, each demo shop maps to a sandbox business account whose credentials are kept in Secrets Manager. In production, Hold would act for shops through PayPal's partner model.

---

## 6. AI

- **Model: Claude Opus 5.5 on Amazon Bedrock, model ID `anthropic.claude-opus-5-5`.** Used to compare photographs, classify differences, write claims, summarize contested claims and run the owner's assistant.
- **Running through judging: Claude Opus 4.6, through its US inference profile `us.anthropic.claude-opus-4-6-v1` and the `AnthropicBedrock` client (bedrock-runtime).** On 27 October 2026 AWS held this account's quota for Opus 5.5 and Opus 4.8 at zero tokens a minute, and only a support case can lift it (section 16, item 14). The same day the participant decided that judging runs on Opus 4.6, verified live, rather than wait on the case. Every adapter sends adaptive thinking where it thinks, effort, structured output and strict tools as before; there is no refusal fallback, since Opus 4.8 is under the same quota. Tools are not sent in strict mode on this path: Bedrock refused the hosted assistant's fifteen strict schemas together (a 496 MB grammar against its 300 MB limit, after up to 107 seconds), and three strict advocate tools cost about 18 seconds a move against 3 without. Hold's gateway and the negotiation referee check every argument on the server, so strict mode was a guard on the model's writing, not an access control. Each role may invoke that profile and the model in the three regions it routes to (`CLAUDE_INVOKE_RESOURCES` in `infra/lib/settings.ts`); the Mantle grants for Opus 5.5 stay, so going back is a change to the five model constants and adapters only.
- **Access: Amazon Bedrock**, through the `AnthropicBedrockMantle` client in `@anthropic-ai/bedrock-sdk`. It serves the same Messages API as Anthropic's own, so `@anthropic-ai/sdk` supplies the types, the zod structured-output helper and the tool runner. Bedrock model IDs carry the `anthropic.` prefix. Calls are signed with the task's IAM role, so there is no Claude key to store.
- **Structured outputs** for every comparison, so each finding is a record with a view, a location, a class, a confidence and a matched price-list entry.
- **Streaming** for the owner's assistant.

**Settings to get right from the start**

- Set the effort level explicitly. Its default on this model is medium. Use high for photograph comparison, where accuracy matters most, and low to medium for messages and the assistant.
- Do not force a specific tool call. Opus 5.5 rejects forced tool choice. Use automatic tool choice with strict tool schemas.
- Check the stop reason on every response and handle a refusal cleanly. Bedrock has no server-side fallbacks, so register the SDK's client-side `betaRefusalFallbackMiddleware`, falling back to `anthropic.claude-opus-4-8`.

### 6.1 The comparison pipeline

**Implementation status, 20 October 2026.** Guided staff returns and the comparison worker are implemented through staff review, including a separate named manual inspection record. The current deterministic aligner supports small translations and defers when it cannot align reliably. Accuracy has not yet been measured on the project's tuning/gate photographs; the bare trial and the evaluation/scorecard release work remain open. See architecture sections 9.1 and 10.3 for implemented boundaries and budgets.

The worker uses the Bedrock SDK's Mantle client. Its role needs `bedrock-mantle:CreateInference`, constrained by `bedrock-mantle:Model` to the configured primary and fallback models and by `aws:RequestedRegion`. AWS documents this model condition in [Security and IAM roles](https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-managed-agents-openai-security.html). The permission is also added to Hold's permissions boundary. Applying that boundary requires an administrator to deploy `HoldDelivery`; the ordinary pipeline cannot change its own boundary. No infrastructure is deployed by implementing this feature.

Comparing two photographs for a small scratch is the hardest technical problem in Hold. No single tool should be trusted with it alone. The recommended approach uses the cheapest reliable method first and the model for judgment.

| Step | Where | Tool | Purpose |
|---|---|---|---|
| 1. Quality check | Phone | OpenCV.js | Reject blurred, dark or badly framed photographs at once |
| 2. Normalize | Worker | sharp | Correct orientation, size and exposure |
| 3. Align | Worker | OpenCV.js | Line the return photograph up with the handover photograph |
| 4. Find candidate regions | Worker | OpenCV.js | Mark areas that changed, as hints |
| 5. Judge | Worker | Claude Opus 5.5 | Look at both full images and close crops of each region. Decide no change, wear or damage, with confidence |
| 6. Price | Worker | Plain code | Match each finding to the shop's published price list |
| 7. Decide | A person | The approval screen | Accept, reduce, remove or add |

**Why both a classical method and a model.** Alignment and difference-finding are precise but cannot tell a scratch from a shadow or a wet patch. The model understands what it is looking at but can miss a small mark in a large image. Together, the classical step points and the model judges.

**What AI is not used for:** deciding to charge, setting prices, and deciding what a payment's status is.

**An evaluation set comes first.** Before any of this is trusted, collect pairs of photographs with known outcomes: no change, wear, and damage of several kinds, in good and poor light. Measure the pipeline against that set. Without it, there is no way to know whether a change made things better or worse.

**The set has two halves.** One is used for tuning. The other is never looked at while tuning, and its results are the ones published. See `extensions.md` section 5.

### 6.2 Agents

The extensions add four agents to the owner's assistant. All that run inside Hold use `claude-opus-5-5` and the same tool gateway.

| Agent | Runs in | Tools | Acts on money |
|---|---|---|---|
| Owner's assistant | web | Hold's read tools, PayPal's read tools, proposals | Only through a proposal the owner approves |
| Operations agent | worker, each night | The same read tools, proposals, template reminders | Only through a proposal the owner approves, or a standing rule the owner set |
| Shop's advocate | worker | Three moves: offer, accept, pass | Only inside the owner's settlement limits |
| Renter's advocate | worker | The same three moves | Only inside the renter's limit |
| A renter's own assistant | Outside Hold | Hold's MCP server | Never. The renter approves in PayPal. |

- **Effort:** high for the advocates and for the operations agent's investigation, low for reminders.
- **Structured output** for every proposal and every offer.
- **Each advocate runs in its own context.** One side's limits are never sent in a call made for the other side.
- **Every run has a ceiling** on tool calls, tokens and elapsed time.

---

## 7. Photographs and evidence

Photographs are Hold's evidence, so how they are stored matters as much as how they are compared.

- **Amazon S3 with Object Lock.** A retained object version cannot be overwritten or deleted until its retention period ends. Versioning can still create a new object under the same key, so document publication additionally uses conditional creation, SHA-256 checksums and exact object-version references.
- **A fingerprint for every photograph.** A SHA-256 hash is recorded in the database at upload. Any later copy can be proved identical.
- **Server time, not phone time.** The capture time recorded is the moment the server received the upload.
- **Private by default.** Renters and staff see photographs only through short-lived signed links.
- **Faces blurred.** Amazon Rekognition finds faces and sharp blurs them before the display copy is saved. The original stays locked for evidence.
- **Display copies.** Smaller versions are generated for fast loading on a phone.
- **Evidence packs.** Frozen, validated snapshots are reserved with lifecycle transactions and rendered on the worker into immutable versioned PDFs and photograph manifests. The PDF contains paired face-blurred display photographs and outlines, historical agreed prices/policy, human decisions, replies and verified payment records; sandbox/simulation and incomplete stages are explicit. The manifest distinguishes original and embedded display SHA-256 hashes and preserves sealed-session chain links without storage keys. Missing display copies block publication and retry; no original fallback is permitted. The stored snapshot is internal; downloads expose only the PDF and shared manifest. A later dispute submission can use these artifacts.
- **PDFKit `0.20.2`.** The evidence package uses PDFKit with its TypeScript definitions. Standard Helvetica covers the four Western-language label sets without external font assets; arbitrary non-Latin names/comments require a future embedded Unicode font. The worker ships PDFKit and sharp as pinned external modules for font data and native-library bundling. Python/PyMuPDF is local inspection tooling, never a production dependency.
- **Private downloads.** Authenticated staff or signed renter actions resolve the rental and published pack before issuing exact-version S3 URLs lasting at most 300 seconds. Draft/awaiting-approval snapshots stay staff-only; record pages read without causing builds. Earlier published versions remain immutable.

---

## 8. Compute: AWS App Runner

- **The web app on App Runner,** as one container service with its own HTTPS address. There is no load balancer, NAT gateway or VPC to run. A custom domain can be added later through App Runner.
- **The worker is not on App Runner.** App Runner gives an instance CPU only while it answers a request, so a process that polls queues or runs between requests would be throttled. The worker's compute is chosen when its code exists: most likely Lambda functions fed by the SQS queues, built from the same code (`architecture.md` section 22.2).
- **Why a worker and not everything in web:** comparison takes seconds and uses memory. It must not slow the counter screens, and it must be retried independently.
- **Docker.** One multi-stage Dockerfile builds one image. Web and worker start from it with different commands. Docker Compose runs both with PostgreSQL for local development.
- **Match the processor architecture.** Build the image for the architecture it runs on. The image library ships different binaries for each.
- **Amazon ECR** stores the images.

---

## 9. Authentication and authorization

### 9.1 Owners and staff: Amazon Cognito

- **One Cognito user pool** for owners and staff.
- **Passwordless sign-in** by emailed code or passkey, on Hold's own `/sign-in` and `/sign-up` pages, which call Cognito. Seasonal staff should not need a password. `architecture.md` section 12.1 says what is built so far.
- **A passkey as the second factor** for owners, managers and anyone who can approve a claim above the shop's threshold, with user verification required, so the device and the person's fingerprint, face or PIN prove it together. Not an authenticator app: Cognito asks for one only after a password, and a person who turns one on can no longer sign in with an emailed code. Cognito's own MFA setting is off for that reason (`architecture.md` section 12.1, decision 31).
- **Codes go out through Hold's SMTP account, not SES.** SES stayed in its sandbox, where it sends only to verified addresses, and Hold has no domain of its own. So Cognito hands each sign-up and sign-in code to a custom email sender, the Lambda function `hold-code-sender` (`apps/worker/src/code-sender.ts`). Cognito encrypts the code with Hold's KMS key; the function decrypts it with the AWS Encryption SDK (`@aws-crypto/client-node`) and emails it through the SMTP account. It never logs the code or the address. Cognito still needs an SES identity, `rogerjeasybavibidila@gmail.com`, before it allows email codes at all, but sends nothing through it.
- **Staff invitations** go through the same SMTP account, by the `Mailer` interface in `packages/notify`.
- **The SMTP account** is a Gmail account with an app password, kept as the JSON secret `hold/email/smtp` (`host`, `port`, `user`, `password`). An administrator creates and fills it; no template, image or setting holds the password. Gmail sends up to about 500 messages a day, which covers judging. Mail comes from the Gmail address, which Gmail's own servers vouch for.
- **Tokens** verified by each service with the `aws-jwt-verify` library.

### 9.2 What each person may do

Cognito answers "who is this?" Hold's database answers "what may they do in this shop?" A person can work at more than one shop, or own several locations.

| Level | Held in | Examples |
|---|---|---|
| Account type | Cognito groups | owner, staff, platform administrator |
| Role in a shop | Aurora, checked on every request | owner, manager, counter staff, read-only |
| Approval limits | Aurora, from the shop's settings | who may approve claims, and up to what amount |

- **Row-level security in Aurora** by shop, so one shop can never read another's rentals or photographs.

### 9.3 Renters: no account

Renters do not sign up. That is a product decision, and the technology follows it.

- **Signed, expiring links.** Each rental has a link that carries a signed token for that rental only.
- **Identity from PayPal.** The renter is the PayPal payer who approved the order. Their payer ID and email come from PayPal.
- **Limited scope.** The link allows viewing the rental, paying its fee, confirming condition, extending, and accepting or contesting a claim. Nothing else. Paying happens in PayPal, approved by the renter there.
- **Sensitive actions re-confirm.** Contesting or accepting a claim sends a one-time code to the email PayPal provided.

### 9.4 Connecting the shop's PayPal account

In the hackathon build, the owner pastes their sandbox app's client ID and secret. Hold checks them with PayPal and keeps them in Secrets Manager. In production, Log in with PayPal and PayPal's partner model would replace this (`architecture.md` section 12.4).

---

## 10. Database: Amazon Aurora Serverless v2

- **Aurora Serverless v2, PostgreSQL-compatible.**
- **Access library:** Drizzle, with migrations in the repository. Deployed, it reaches Aurora through the **RDS Data API**: SQL over HTTPS, signed with IAM, so App Runner needs no VPC connector and the cluster accepts no network connections at all. Locally, the same schema runs on PostgreSQL in Docker through Drizzle's ordinary driver. The database is `hold_db`, because Aurora reserves `hold`. While the cluster is paused at zero capacity, the first call fails with `DatabaseResumingException`, usually for under a minute and once for longer, so the adapter retries that error for up to three minutes.
- **The services' logins** are `hold_app` for web and `hold_worker` for the worker. Neither owns a table, so row-level security applies to both. Migrations run as `hold_admin`, the owner. The first migration creates both roles without a login; deploying gives each its login and the password in Secrets Manager under `hold/database/`. The worker's secret is created with the worker.
- **What the roles may do.** Read, insert and update, and nothing else. No role may delete a row. The money log, approvals and the audit trail also refuse updates. People and renters, who are shared across shops, are written only through database functions.
- **What the Data API cannot carry.** It sends every string as text and cannot send an array. So columns with a fixed list of values are text with a check constraint, not enums (decision 30), and lists are `jsonb`.
- **Migrations on Aurora** run with `pnpm --filter @hold/db migrate:aurora`, as `hold_admin`, with the cluster's ARN and both secrets' ARNs in the environment. The same run gives `hold_app` its login, sending PostgreSQL only the password's SCRAM verifier. `packages/db/scripts/check-aurora.ts` then checks a sign-up as `hold_app` and rolls it back.

**How the data is kept**

- **Holds as state machines.** Each hold moves through explicit states such as requested, placed, renewed, partly captured, released and expired. A change that is not allowed cannot happen.
- **Money as whole cents** in integer columns, with the currency beside each amount.
- **An append-only money log.** Every authorization, capture, void and refund is a permanent row linked to the PayPal event that confirmed it.
- **Approvals as records.** Who approved which claim, when, and what they changed.
- **Item passports.** Each item's photographs and findings, in date order, so a mark's first appearance is always known.
- **PayPal events stored as received,** each with its PayPal identifier.
- **Row-level security** by shop.

**Operating notes**

- Keep minimum capacity above zero during judging, so a judge's first visit is not slowed by the database resuming.
- Point-in-time recovery switched on.
- Encryption at rest with AWS KMS.

---

## 11. Queues and schedules

- **Amazon SQS** carries work that should not block the counter: comparing a photo session, applying a PayPal webhook, building an evidence pack, sending a message. Each queue has a dead-letter queue.
- **AWS Lambda runs the worker.** Functions fed by the queues apply PayPal's events, carry out executions such as capturing fees and placing holds, and keep placed holds watched, and one started every minute relays the outbox. App Runner cannot do this, since it throttles CPU between requests. The web app and the worker send to SQS with `@aws-sdk/client-sqs`, at the version of the other AWS clients.
- **Amazon EventBridge Scheduler** drives everything time-based:
  - charging an unanswered claim before the hold lapses
  - asking the renter for a replacement hold three days before the 29-day limit, and marking a hold expired at it
  - reminding a renter that a return is due
  - closing a claim when the renter's reply period ends
  - nightly reconciliation against PayPal
  - the outbox relay, every minute

  The worker makes each hold's one-off schedules at run time with `@aws-sdk/client-scheduler`, at the version of the other AWS clients, in the `hold-schedules` group.
- **Hold's SMTP account** sends email to renters and owners.

**Evidence and settlement delivery.** The outbox relay sends reserved pack IDs to `evidence` and receipt IDs to `messages`. Dedicated evidence and receipt Lambda roles use only their artifact/database or SMTP/link-signing permissions; the renderer has no PayPal credentials. Publication queues receipts bound to that exact pack. Verified capture plus its remainder is one receipt; verified release, refund, invoice sent and invoice paid are distinct. A protective capture leaves the contest open, and invoice sent never means paid. Fee payments and renewals do not issue settlement receipts.

`receipt_deliveries` records the verified event, kind, pack, lease, attempts and `queued`/`sending`/`sent`/`failed` status. Both the worker and simulated web environment run the shared `@hold/settle` delivery state machine through transport ports; demo emails remain in memory. A five-minute lease prevents concurrent sends, and the messages queue has six-minute visibility. Recorded sends make ordinary duplicates no-ops; SMTP acceptance followed by a worker crash can still duplicate an email. Missing verified payer contact is a visible delivery failure.

Receipts contain a view-only link selecting the exact pack UUID, not a PDF attachment. It expires 60 days after the later of rental end or receipt issuance, so a late refund still gives the renter time to read its record. Retries may create multiple valid expiring read-only links; only token fingerprints are stored. Deploy the updated `HoldDelivery` permissions boundary before compute. Deployment and Linux Lambda bundle execution remain unverified.

**Hold upkeep is the scheduler's most important job.** A hold that lapses unnoticed leaves the shop unprotected. Every hold has a schedule created with it and removed when it ends.

---

## 12. Infrastructure, delivery and monitoring

- **AWS CDK in TypeScript** defines every resource, so the environment can be recreated from the repository. The code is in `infra/`. The account's existing CDK bootstrap is shared, and Hold's stacks are `HoldData`, `HoldIdentity`, `HoldWork`, `HoldRegistry` and `HoldDelivery`.
- **GitHub Actions** builds, tests and deploys, signing in to AWS through OpenID Connect with no stored keys. CI runs on every pull request; Deploy runs on main once CI passes (`architecture.md` section 20.2). The role is `hold-github-deploy`, in the HoldDelivery stack, and uses the account's existing GitHub identity provider.
- **AWS Secrets Manager** holds PayPal credentials. Claude on Bedrock is reached with the task's IAM role, so no Claude key is stored.
- **Amazon CloudWatch** for logs, metrics and alarms. Alarms on failed captures, holds about to lapse, failed webhooks and queue backlogs.
- **AWS WAF** on the App Runner service is optional, for rate limiting on the public renter links.

---

## 13. Security

- **Least privilege.** Each service has its own IAM role.
- **No secrets in the repository or the container image.**
- **Webhook signatures verified.**
- **Evidence that cannot be altered.** Object Lock and recorded hashes.
- **Renter links** are signed, expire, and are bound to one rental.
- **Encryption** in transit everywhere and at rest in Aurora and S3.
- **Minimal personal data.** Photographs of items, the renter's PayPal identity and contact email. Faces blurred.
- **Audit trail** of every approval, capture and release.

---

## 14. Testing

**Evidence and receipt validation, 20 October 2026.** The final local check passed 159 test files and 1,233 tests. The production build, record-download browser flow and four handover/return/claim regression flows passed. Staff and renter PDF/manifest bytes matched, historical versions stayed fixed, and both record pages passed every required viewport. A recorded RDS Data API regression verifies that JSONB SQL expressions are decoded before snapshot validation, while PostgreSQL tests cover the underlying snapshot query. These are local and recorded-response checks; deployed AWS permissions/Object Lock, Linux Lambda execution, actual SMTP delivery and fresh PayPal sandbox trials remain outstanding.

- **Vitest** for unit tests. The hold state machine and the claim arithmetic get the heaviest coverage.
- **PGlite** for repository and row-level security tests: PostgreSQL compiled to WebAssembly, running inside the test process with every migration applied. `pnpm test` then needs no Docker daemon. It is PostgreSQL 18 where Aurora is 17.9, and Hold uses nothing that differs between them. The database package exports it as `@hold/db/testing`.
- **Playwright** for end-to-end tests. Chromium can be given a recorded image as its camera, so the guided photo sessions are tested automatically.
- **PayPal sandbox** with seeded business accounts for demo shops and personal accounts for demo renters.
- **PayPal webhook simulator** to replay payment events.
- **PayPal negative testing** to prove Hold behaves correctly when an authorization is declined, a capture fails or a hold has expired.
- **The photo evaluation set,** run before every release, reporting how often damage is caught and how often clean returns are wrongly flagged.
- **Property tests with fast-check** for the negotiation referee, the trust ladder and the detectors.
- **MCP Inspector** to check Hold's MCP server by hand, and a scripted MCP client in the end-to-end tests.
- **Evidence and receipt tests** cover frozen version reuse/change, initial-state and worker-only publication guards (migrations `0018`–`0020`), cross-shop/rental denial, conditional artifact recovery, missing display copies, verified-event receipt creation, leases, duplicate delivery and failure recovery. PDF text extraction and page rasterization inspect generated fixtures in all four document languages, a clean return and long multi-item content. Browser checks cover exact selected versions, PDF/manifest downloads and responsive record pages. Integrated verification status is recorded with the feature; deployed AWS/Linux behavior and fresh live PayPal/AI trials require separate verification.

---

## 15. Sponsor tools

A project can win one sponsor prize. Using more than one tool means being considered for each.

| Tool | Use in Hold | Verdict |
|---|---|---|
| **Bryntum** | The rental calendar on Bryntum Scheduler, with flags from PayPal state and moves proposed by the operations agent | Use. The prize page's own example is an equipment rental calendar that locks a booking only once its PayPal payment clears, which is Hold. Three winners. |
| **AG Grid** | The owner's insights dashboard on AG Studio, with custom widgets and an insights agent on the Studio Agent Framework | Use. Largest sponsor prize. The judges ask for AG Studio, "not just AG Grid or AG Charts on their own", so plain data tables would not compete. |
| **Postman** | Sandbox testing of the hold lifecycle, and a published collection for judges | Use. No prize. |
| **APIMatic** | Context plugins while coding the PayPal integration | Not chosen for now |
| **Channel3** | Could enrich item types from a product catalog. Not central to Hold. | Not chosen for now |
| **Render** | Hosting | Not used, because hosting is on AWS |
| **Elastic, KERNEL, Zapier, Astropods** | No natural role, and no prize | Skip |

**What each prize asks for.** Read from the hackathon's sponsor pages on 15 October 2026.

- **AG Grid,** 5,000, 2,000 and three times 1,000 USD: dashboard polish through custom widgets, theming and layout tools, and use of the Studio Agent Framework, such as a custom agent talking to Studio's built-in agents or a swapped-in harness.
- **Bryntum,** three times 1,000 USD: the best use of Gantt, Scheduler or Calendar, "whether that's the cleanest timeline, the smartest resource booking, or an agent that drives the schedule itself".
- **APIMatic,** three times 1,000 USD and six months of its Business plan: built around the Context Plugin for PayPal used by the coding agent.
- **Channel3,** one prize of 1,500 USD: the API or MCP server called as a meaningful part of the product, for search, product enrichment or recommendations.
- **Render,** credits: deployment on Render with Render Workflows.

**Trial licences.** AG Studio and Bryntum both offer a 45-day trial. A trial started before 31 October 2026 ends before judging closes on 15 December, and judges must be able to run the hosted demo throughout. Start both on or after 31 October, or ask each team on the PayPal Discord for a licence that runs through judging. What an expired trial does to the page has not been checked. Bryntum's trial is installed as `@bryntum/scheduler@npm:@bryntum/scheduler-trial`.

---

## 16. Things to settle on day one

Each of these should be tried against the real services before the build depends on it. The first four decide whether the core of Hold works as designed.

1. **The baseline hold.** Place a hold as its own authorize-first order, then void it, and separately capture part of one as the final capture. Confirm the remainder is released. This is the path every rental can use.
   **Confirmed in the sandbox on 14 October 2026, nine of nine checks.** The authorization's `expiration_time` is exactly 29 days after its `create_time`. After a final capture of 40.00 of a 150.00 CHF hold the authorization reads `CAPTURED`, a further capture is refused with `AUTHORIZATION_ALREADY_CAPTURED` and a void with `PREVIOUSLY_CAPTURED`. A voided hold refuses capture with `AUTHORIZATION_VOIDED`. Repeating a capture with the same `PayPal-Request-Id` returns the first capture with status 200 instead of 201. The authorization keeps showing the full amount after capture, so the remainder is known from the status, not from an amount.
2. **One approval for walk-ins.** PayPal does not allow an authorize-first order with more than one purchase unit, so the fee and deposit cannot be two parts of one order. The alternative is a single authorization for fee plus deposit, with the fee captured at once as a non-final capture. Confirm that the remainder stays held and can then be renewed and released. If it cannot, walk-ins approve twice.
   **Confirmed in the sandbox on 14 October 2026, ten of ten checks, except renewal.** After a 45.00 non-final capture of a 195.00 CHF authorization, it reads `PARTIALLY_CAPTURED`. A later 40.00 final capture succeeds and the authorization reads `CAPTURED`. Voiding instead succeeds and the authorization reads `VOIDED`, after which capture is refused. Walk-ins approve once. Renewal after a partial capture cannot be tried before day 4, so it is part of the two-step trial under item 3.
3. **Renewal.** PayPal allows renewal once per hold, from the fourth day, giving a new identifier. The sandbox refused a renewal on day 1 with `REAUTHORIZATION_TOO_SOON`: "A reauthorization is only allowed once from Day 4 to Day 29 since the date of the original authorization." The sandbox cannot fast-forward time, so renewal rules are tested against a fake PayPal with a controllable clock. One real renewal is also tried by waiting: `trial:renewal place` places a plain hold and a walk-in hold on day 1, and `trial:renewal renew` renews both after day 3 and records what the new and old identifiers allow. Hold renews only at the moment it charges, and falls back to capturing without a renewal, so `trial:renewal place-unrenewed` places a third hold on day 1 and `trial:renewal capture-unrenewed` captures it after day 3 with no renewal. Placed on 14 October 2026: E and F at 02:54 UTC, G later the same day.
4. **Comparison accuracy.** Photograph a real item before and after adding a small mark, in shop lighting, and run the pipeline. Do this before building any screens.
   The bare comparison, the model alone with no alignment, is `pnpm --filter @hold/eval compare:bare <handover photo> <return photo>`. It writes each result, with the model, prompt version, usage and the photographs' fingerprints, to `eval/results/`, which git ignores.
**How to run the first three.** Trials 1 and 2 are scripts that call the sandbox through Hold's PayPal adapter: `pnpm --filter @hold/paypal trial:baseline` and `pnpm --filter @hold/paypal trial:combined`. Each prints approval links for a sandbox personal account, waits, then prints a pass or fail per check and records PayPal's replies in `packages/paypal/trials/recordings/`, which git ignores. Trial 3 is the renewal tests in `packages/paypal/src/fake/fake-paypal.test.ts`. The fake marks the rules the sandbox has not yet confirmed.

5. **Saved payment methods for returning renters.** In production PayPal must approve the merchant for this. Treat it as optional.
6. **Dispute evidence in the sandbox.** Confirm that a test dispute can be opened and that evidence can be uploaded through the API.
   **Still open.** The operations agent's approved dispute answer is sent with `POST /v1/customer/disputes/{id}/send-message` and a JSON body `{ "message": ... }`, with the proposal as `PayPal-Request-Id` (`sendDisputeMessage` in `packages/paypal/src/rest/disputes.ts`). Both the JSON body and the request-id deduplication are unconfirmed until a sandbox dispute is opened from the personal account and answered.
7. **Camera behavior on phones.** Test resolution, focus and the installed web app on both iPhone and Android. Browsers differ.
8. **Object Lock.** It must be switched on when the bucket is created. It cannot be added later.
9. **Pay Later with a hold.** Pay Later may not be offered on an order that authorizes first. Treat it as optional.
10. **PayPal's MCP server from a server.** Connect an MCP client to the sandbox server with a shop's access token and no browser. List the tools and record their exact names.
    **Result, 26 October 2026.** It works over SSE: `https://mcp.sandbox.paypal.com/sse`, with the shop's OAuth access token (client credentials grant) as `Authorization: Bearer <token>`, using `SSEClientTransport` from `@modelcontextprotocol/sdk` 1.32.1. The documented streamable HTTP path `/http` answers 404, and `/mcp` answers 404 to a valid token. The server listed 46 tools: `create_invoice`, `create_recurring_series`, `activate_recurring_series`, `get_recurring_series`, `cancel_recurring_series`, `delete_recurring_series`, `list_invoices`, `get_invoice`, `send_invoice`, `send_invoice_reminder`, `cancel_sent_invoice`, `delete_invoice`, `setup_invoice_auto_reminders`, `update_invoice_auto_reminder`, `search_invoicing`, `update_invoicing`, `cancel_invoice_auto_reminder`, `generate_invoice_qr_code`, `generate_invoice_number`, `record_payment_for_invoice`, `record_refund_for_invoice`, `create_conditional_rules_for_invoice`, `create_product`, `list_products`, `update_product`, `show_product_details`, `create_subscription_plan`, `list_subscription_plans`, `show_subscription_plan_details`, `create_subscription`, `show_subscription_details`, `cancel_subscription`, `update_subscription`, `create_shipment_tracking`, `get_shipment_tracking`, `update_shipment_tracking`, `create_order`, `get_order`, `pay_order`, `list_disputes`, `get_dispute`, `accept_dispute_claim`, `list_transactions`, `create_refund`, `get_refund`, `get_merchant_insights`. A `list_transactions` call over the last week returned the account's report.
11. **The payer ID across shops.** Pay two different sandbox business accounts from one sandbox personal account and compare the payer IDs. The Clean Record's key depends on them matching.
12. **The approval event.** Approve an order from a bare link with no Hold page open, and confirm that `CHECKOUT.ORDER.APPROVED` arrives so the fee can be captured.
**Claim-settlement adapter validation, 20 October 2026.** Capture read-back, refunds and invoice creation/search/send are implemented through the existing PayPal port with strict recorded-response tests and the controllable fake. The implementation follows the official [Payments v2](https://developer.paypal.com/api/payments/v2/) and [Invoicing v2](https://developer.paypal.com/docs/api/invoicing/v2/) contracts. It does not assume Invoicing supports payment-style request deduplication: it searches a stable invoice number and validates claim reference, amount and currency before reuse. These new adapter paths have not been exercised against a live sandbox in this change; that validation remains outstanding alongside deployment, rather than being represented as a confirmed trial. The participant also explicitly deferred deployment and live AI accuracy evaluation until later. No gate-half evaluation images were used.

**Evidence and receipt implementation, 20 October 2026.** Immutable pack publication and receipt delivery are implemented against local storage/mailer fakes, database guards and the existing verified PayPal-event paths. This adds no confirmed live PayPal trial. Deployment of the new Lambda roles/queues and the updated `HoldDelivery` policy, exact-version S3/Object Lock behavior on AWS, and the Linux PDFKit/sharp runtime bundle still need deployed verification. Local PDF rendering does not establish live comparison accuracy; the live AI evaluation remains deferred and no gate-half images were used.

**Real-service verification resumed, 22 October 2026.** [The verification record](verification/2026-10-22-core-real-services.md) distinguishes live provider observations from simulated inputs and unfinished scenarios. Initial checks confirmed PayPal sandbox credential acceptance, the live `hold_app` login with zero rows visible without scope, and the evidence bucket's 180-day GOVERNANCE Object Lock configuration. The stale administrative deployment policy was updated after review; worker/web rollout and the three rental scenarios are tracked separately. These preflight observations do not establish completed settlement, delivered receipts or comparison accuracy.

**Live worker startup, 22 October 2026.** Deployed empty-batch invocations exposed eager PDFKit initialization in the CommonJS media/comparison bundles. Failing startup tests preceded a photo-only evidence import fix. The corrected JavaScript was deployed with the CI-produced Linux native dependencies; both live handlers then returned an empty failure list without a Lambda function error. Evidence and receipt handlers also started successfully. The post-fix full check passed 160 files / 1,235 tests. These startup checks do not exercise image processing, model inference, PDF rendering, SMTP delivery or settlement.

13. **An outside MCP client.** Connect one common MCP client to a stub of Hold's server with no sign-in step.
14. **Bedrock access to Opus 5.5.** Tried 27 October 2026: the Marketplace agreements for Opus 5.5 and Opus 4.8 are accepted, but the account's applied quotas are zero (Service Quotas refuses a request below the 20 million default). Decided 27 October 2026: Hold runs on Opus 4.6 through judging (section 6), and the case is no longer waited on.

---

## 17. Access for judges

Judges do not have a bike to photograph, so the demo must work without one. They have no inbox Hold can send a code to either, so the demo must not need one.

- **A hosted demo** at a stable address: `https://p99faar3kp.us-east-1.awsapprunner.com`.
- **A demo of each judge's own, with a one-tap sign-in.** One tap on the sign-in page opens a new Ribeira Bikes, busy with sample rentals, with two new accounts: Tomás the owner and Jonas at the counter. A judge types nothing and waits for no code, sees no other judge's demo, and can switch between Tomás and Jonas from the same browser. A step that moves money still asks for a passkey, which the judge adds on their own device. How it works and what it allows are in `architecture.md` section 20.3.
- **Matching sandbox PayPal accounts.** Every demo shop shares one sandbox business account, which an administrator stores once with `pnpm demo:paypal`. A sandbox personal account plays the renter; its sign-in is in the submission's testing instructions.
- **Sample photograph sets** built into the demo, one for each return a judge may want to see. The handover uses the frame as handed over, which has a faint scuff on the down tube. At the return, one tap loads one of three samples in place of the camera: the same photograph again (a clean return), the frame with a chip in the paint (damage), or the frame with the scuff grown into a scratch through the paint (a contested claim). In the sandbox a confirmed finding from them may be billed, so a damaged return can reach a real sandbox capture (`architecture.md` section 20.3). The independent second look confirmed the chip in 2 of 10 runs on Opus 4.6; otherwise the finding waits for a person, who claims it with a written reason. The contested sample is built so that each side has a case: the wear policy says a mark recorded at the handover is never charged again, and the scratch runs on from that mark but is longer and through the paint.
- **The real camera path** also works, for a judge who wants to try it on any object to hand.
- **Nothing to reset.** Each demo starts from the same state, so judges never see each other's changes.
- **Full setup instructions** in the repository's README.
- **A hosted assistant** that books through Hold's MCP server, so a judge can see an AI assistant rent a bike without setting anything up.
- **The MCP server's address** in the README, for a judge who wants to connect their own assistant.

---

## 18. Cost and running through judging

- The environment must stay up from submission on 12 November until judging ends on 15 December 2026.
- Keep the App Runner service small and Aurora's maximum capacity low. Aurora's minimum is zero, so it pauses when idle. Decided 27 October 2026: it is raised to 0.5 for the judging weeks only, 1 to 15 December, by a deploy on 1 December and another on 16 December that sets it back (`DATABASE_MIN_CAPACITY` in `infra/lib/settings.ts`). Until then a judge's first visit after a quiet spell waits for the database to resume.
- Set an AWS billing alarm before deploying anything.
- Set a spending limit on the Claude account. Image comparison uses more tokens than text, and the demo is public.
- Each operations agent run and each negotiation has its own ceiling on calls and tokens.
- Object Lock retention on demo photographs should be short, so the bucket can be cleaned up afterwards.

---

## 19. How certain each part is

**Checked against the source during this work**

- The hackathon's technology rules and sponsor list.
- The PayPal Agent Toolkit's tool list, including the absence of authorize, void, partial capture and reauthorize tools.
- PayPal's hold length of 29 days, the three-day period in which capture is best assured, and that a renewal issues a new identifier.
- The PayPal webhook event names for authorizations and captures.
- The JavaScript SDK v6 setup and its one-time payment sessions.
- The PayPal sandbox MCP server address and transports.
- The Claude model identifiers and the behavior notes in section 6.
- The hackathon's deadline, judging dates and prize limits, from the official rules on 13 October 2026.
- The toolkit's listed adapters, and that the pages checked list none for the Anthropic SDK.

**Confirmed in the sandbox**

- That a final capture for part of a hold releases the remainder, and the error names PayPal gives for capturing or voiding a hold that is already captured or voided. Item 1 in section 16, on 14 October 2026.
- That a hold stays held after a non-final partial capture and can then be captured as final or voided. Item 2 in section 16, on 14 October 2026.
- That a hold can be renewed only once, from day 4. PayPal's error text, 14 October 2026.

**Written from general knowledge and to be confirmed**

- That a hold can be renewed after a non-final partial capture, what amount the renewal covers, and what the old identifier allows afterwards. Item 3 in section 16, two-step trial.
- That a hold never renewed can still be captured after its assured period. Item 3 in section 16, hold G.
- How well a vision model detects small marks between two photographs. This is unproven until measured, and is the main technical risk.
- That OpenCV.js performs well enough on a phone for instant checks.
- Uploading dispute evidence through the API.
- AWS specifics: S3 Object Lock behavior, Rekognition face detection, Aurora's pause behavior and Cognito's sign-in options.
- That Chromium's simulated camera works in the test pipeline.
- That a PayPal payer ID is the same across merchants.
- The `CHECKOUT.ORDER.APPROVED` event and its timing.
- That an outside MCP client can use a remote server with no sign-in step.
