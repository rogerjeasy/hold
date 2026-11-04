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
| AI model | Claude on Amazon Bedrock, through the Anthropic Bedrock SDK, for building and judging: Opus 4.6 (`us.anthropic.claude-opus-4-6-v1`) for the photograph comparison, Opus 4.5 (`us.anthropic.claude-opus-4-5-20251101-v1:0`) for every agent. Designed for Opus 5.5, which the account has no quota for (section 6) |
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
| Text messages | AWS End User Messaging SMS (`@aws-sdk/client-pinpoint-sms-voice-v2`), for renters who choose texts (architecture.md section 12.3) |
| Push notifications | Expo's push service (HTTP API, through `fetch`), to the phone app on iOS and Android (architecture.md section 13.9) |
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
- **A model's Markdown.** The hosted assistant answers in Markdown, with emphasis, lists, headings and tables. `react-markdown` 10.1.0 with `remark-gfm` 4.0.1 (GitHub's tables, strikethrough and task lists) renders it as structure through one component, `src/components/ui/markdown.tsx`, chosen over a parser of Hold's own because GitHub's Markdown has edge cases a second parser would get wrong. HTML in the text is dropped, never rendered; a picture is shown as its description and never fetched; only `https:`, `http:` and `mailto:` links are followed, in a new tab without the opener; a wide table scrolls in its own box. What the person typed is shown exactly as typed.
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

Built means in the code and its tests; planned means designed here and not in this build.

| Hold feature | PayPal product | How Hold reaches it | In this build |
|---|---|---|---|
| The rental fee is paid | Orders v2, capture | The JavaScript SDK v6 button on the renter's page, or PayPal's approval page; REST on the server | Built |
| The deposit is reserved as its own hold | Orders v2 with intent to authorize | The same button, or approval by link or QR code; REST on the server | Built |
| A clean return releases it | Void of the authorization | Direct REST | Built |
| Damage is charged | Partial capture as the final capture | Direct REST | Built |
| A longer rental keeps its protection | Reauthorization at the moment of charging | Direct REST | Built; observed live on 28 October 2026 (section 16, item 3) |
| Damage beyond the hold | Invoicing v2 | Direct REST | Built |
| A claim is reduced after review | Refunds | Direct REST | Built |
| A renter disputes a charge | Disputes v1: read, and the shop's answer as evidence with the rental's evidence pack | Direct REST, multipart for the evidence | Built; the evidence call is not yet tried on a sandbox dispute |
| The true state of every payment | Webhooks, verified and read back | A webhook address per shop, and one shared address for every demo shop, routed by the order's `custom_id` | Built |
| The operations agent's overnight checks | Transactions, orders, disputes and invoices | PayPal's sandbox MCP server over `/sse`, read tools only, through Hold's own MCP client | Built |
| A booking made by a renter's assistant | Orders v2, with PayPal's approval link | Direct REST, with the `CHECKOUT.ORDER.APPROVED` event as a backstop | Built |
| A smaller hold for a trusted renter | Orders v2 with intent to authorize, for the ladder's amount | Direct REST | Built |
| A settlement agreed by two advocates | Partial capture as the final capture | Direct REST | Built |
| A returning renter | Vault payment token | Direct REST | Planned |
| Shipped rentals | Shipment tracking | Direct REST | Planned |
| Owner signs up | Log in with PayPal | Direct OAuth exchange | Planned |
| Rental fee spread over time | Pay Later | JavaScript SDK v6, where offered | Planned |
| The owner's assistant | PayPal's MCP server | Read tools only | Planned |
| A shop connects its account | PayPal's partner onboarding | Partner referrals | Planned; a shop pastes its own app's client ID and secret today |

**Packages and endpoints**

- PayPal REST APIs called directly: Orders v2, Payments v2 (authorizations, captures, refunds), Webhooks v1, Invoicing v2 and Disputes v1.
- PayPal's hosted sandbox MCP server at `https://mcp.sandbox.paypal.com/sse`, through `@modelcontextprotocol/sdk`, read tools only, for the operations agent.
- The PayPal JavaScript SDK v6 (`https://www.sandbox.paypal.com/web-sdk/v6/core`), loaded on the renter's fee and hold pages with the shop's public client ID. Where it cannot load, the page sends the renter to PayPal's approval page as before.
- `@paypal/agent-toolkit` is not used. See below.

**The hold lifecycle is not in the Agent Toolkit.** The toolkit's payment tools create an order, read it, capture it and refund it. It has no tool to authorize, partially capture, void or reauthorize. Those calls are the core of Hold, so they go directly to the REST API. This suits the product, because each of them must sit behind Hold's own approval record.

**The Agent Toolkit for the assistant's payment step: considered and not used (28 October 2026).** A renter's assistant pays nothing itself: `create_booking` makes the order from a quote Hold priced and returns PayPal's approval link, and the renter approves in PayPal. The toolkit's `create_order` takes its amount from the model, which would break the rule that no assistant's tool takes an amount. Its pages also list no adapter for the Anthropic SDK. Hold reaches PayPal's own MCP server directly where an agent needs PayPal's records.

**How Claude reaches PayPal's tools.** Hold connects its own MCP client to PayPal's sandbox MCP server, keeps only the read tools on its allowlist, and offers them to Claude through Hold's tool gateway. The shop's PayPal token stays inside Hold, and every call is logged. Tool names are matched against what the server lists, because PayPal's pages spell some of them differently.

**Facts about PayPal holds that shape the product**

- A hold reserves funds for up to 29 days.
- Capture is best assured in the first three days. After that, Hold renews the hold at the moment it charges, so the capture falls inside the renewal's own three days (`architecture.md` section 7.4).
- A renewal issues a new authorization identifier, and later captures must use it.
- A hold can be renewed only once, from day 4 to day 29. This is PayPal's own wording in the sandbox, confirmed on 14 October 2026. A second renewal is refused with `REAUTHORIZATION_NOT_SUPPORTED` (28 October 2026).
- A renewal keeps the original end of validity, give or take a second: PayPal reported it one second later (28 October 2026).
- A capture can be for less than the held amount.

**Rules for every PayPal call**

- **PayPal's record is the truth.** A hold is recorded as placed, captured or released only after a verified webhook or a direct read from PayPal. Every webhook signature is verified, and what it names is read back.
- **Every write carries an idempotency key,** so a retry never captures twice.
- **Every capture sits behind a named person's approval** in Hold's own database.

**The shop's PayPal account.** Each shop is paid into its own PayPal business account, whose app credentials it pastes in once and Hold keeps in Secrets Manager. Every demo shop shares one sandbox business account. In production, Hold would act for shops through PayPal's partner model, which is not built.

---

## 6. AI

**As deployed, 3 November 2026.** Seven adapters reach Claude, each the only code in its package that does: the photograph comparison (`packages/compare/src/bedrock-model.ts`), the contest summary and the incident sort (`packages/compare`), the two advocates (`packages/negotiate`), the operations investigator (`packages/ops`), the hosted assistant (`packages/mcp/src/hosted`) and the insights agent (`packages/agent`). All seven go through the `AnthropicBedrock` client (bedrock-runtime), signed with the function's IAM role, on one of two models named once in `packages/domain/src/claude-models.ts`: the comparison on `us.anthropic.claude-opus-4-6-v1`, the other six on `us.anthropic.claude-opus-4-5-20251101-v1:0`. Bedrock limits each model's tokens a day on its own, and Opus 4.5's limit in this account is listed at 6,750,000 against about 940,000 measured for Opus 4.6, so since 3 November 2026 the agents, which spend most of the tokens, run on Opus 4.5 and the comparison, which reads photographs and spends about 5,000 tokens a sample, stays on Opus 4.6. Effort is set on every call: high for the comparison's two looks, medium everywhere else; Opus 4.5 takes it only under the `effort-2025-11-24` beta, which the six send. The comparison, the contest summary and the incident sort answer in structured output checked against a zod schema, with no tools; the investigator calls read-only PayPal and Hold tools through the gated tools and then answers in structured output; the advocates move by tool calls that the gateway and the referee check; the hosted assistant and the insights agent use tools with automatic tool choice. Adaptive thinking is on for the comparison; Opus 4.5 has none, so the advocates and the investigator think within a fixed budget of 2,048 tokens (`AGENT_THINKING_TOKENS`). Nothing streams, and there is no refusal fallback. Every adapter checks the stop reason, treats a refusal as an outcome, and stores the model and prompt version with what it wrote.

- **Model as designed: Claude Opus 5.5 on Amazon Bedrock, model ID `anthropic.claude-opus-5-5`.** Used to compare photographs, classify differences, summarize contested claims and argue claims. Not deployed: see the next point.
- **Running through judging: Claude Opus 4.6, through its US inference profile `us.anthropic.claude-opus-4-6-v1` and the `AnthropicBedrock` client (bedrock-runtime).** On 27 October 2026 AWS held this account's quota for Opus 5.5 and Opus 4.8 at zero tokens a minute, and only a support case can lift it (section 16, item 14). The same day the participant decided that judging runs on Opus 4.6, verified live, rather than wait on the case. Every adapter sends adaptive thinking where it thinks, effort, structured output and strict tools as before; there is no refusal fallback, since Opus 4.8 is under the same quota. Tools are not sent in strict mode on this path: Bedrock refused the hosted assistant's fifteen strict schemas together (a 496 MB grammar against its 300 MB limit, after up to 107 seconds), and three strict advocate tools cost about 18 seconds a move against 3 without. Hold's gateway and the negotiation referee check every argument on the server, so strict mode was a guard on the model's writing, not an access control. Each role may invoke that profile and the model in the three regions it routes to (`CLAUDE_INVOKE_RESOURCES` in `infra/lib/settings.ts`); the Mantle grants for Opus 5.5 stay, so going back is a change to the five model constants and adapters only.
- **Access as designed: Amazon Bedrock**, through the `AnthropicBedrockMantle` client in `@anthropic-ai/bedrock-sdk`; as deployed, the `AnthropicBedrock` client, since Opus 4.6 is not served through Mantle. It serves the same Messages API as Anthropic's own, so `@anthropic-ai/sdk` supplies the types, the zod structured-output helper and the tool runner. Bedrock model IDs carry the `anthropic.` prefix. Calls are signed with the task's IAM role, so there is no Claude key to store.
- **Structured outputs** for every comparison, so each finding is a record with a view, a location, a class, a confidence and a matched price-list entry.
- **Streaming** for the owner's assistant, which is planned and not built (`architecture.md` section 10.5). Nothing deployed streams.

**Settings to get right from the start**

- Set the effort level explicitly. Its default on this model is medium. Use high for photograph comparison, where accuracy matters most, and medium for the rest, as deployed.
- Do not force a specific tool call. Opus 5.5 rejects forced tool choice. Use automatic tool choice with strict tool schemas.
- Check the stop reason on every response and handle a refusal cleanly. Bedrock has no server-side fallbacks. The design registers the SDK's client-side `betaRefusalFallbackMiddleware`, falling back to `anthropic.claude-opus-4-8`; as deployed there is none, since Opus 4.8 has the same zero quota.

### 6.1 The comparison pipeline

**Implementation status, 20 October 2026.** Guided staff returns and the comparison worker are implemented through staff review, including a separate named manual inspection record. The current deterministic aligner supports small translations and defers when it cannot align reliably. Accuracy has not yet been measured on the project's tuning/gate photographs; the bare trial and the evaluation/scorecard release work remain open. See architecture sections 9.1 and 10.3 for implemented boundaries and budgets.

As deployed the worker calls `us.anthropic.claude-opus-4-6-v1` through bedrock-runtime, and its role may invoke that profile and the model in the three regions it routes to (section 6). No role and no boundary grants anything else of Bedrock: the `bedrock-mantle:CreateInference` grants for Opus 5.5 and Opus 4.8 were removed on 4 November 2026, because nothing called them (`infra/lib/hold-app.test.ts` checks that no template names Mantle or either model). The Mantle design, if the account gets quota for Opus 5.5: the worker uses the Bedrock SDK's Mantle client, and its role needs `bedrock-mantle:CreateInference`, constrained by `bedrock-mantle:Model` to the configured primary and fallback models and by `aws:RequestedRegion` ([Security and IAM roles](https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-managed-agents-openai-security.html)). The permission would go into Hold's permissions boundary too, which only an administrator's deploy of `HoldDelivery` changes; the pipeline cannot change its own boundary.

Comparing two photographs for a small scratch is the hardest technical problem in Hold. No single tool should be trusted with it alone. The recommended approach uses the cheapest reliable method first and the model for judgment.

| Step | Where | Tool | Purpose |
|---|---|---|---|
| 1. Quality check | Phone | OpenCV.js | Reject blurred, dark or badly framed photographs at once |
| 2. Normalize | Worker | sharp | Correct orientation, size and exposure |
| 3. Align | Worker | OpenCV.js | Line the return photograph up with the handover photograph |
| 4. Find candidate regions | Worker | OpenCV.js | Mark areas that changed, as hints |
| 5. Judge | Worker | Claude (Opus 4.6 as deployed) | Look at both full images and close crops of each region. Decide no change, wear or damage, with confidence |
| 6. Price | Worker | Plain code | Match each finding to the shop's published price list |
| 7. Decide | A person | The approval screen | Accept, reduce, remove or add |

**Why both a classical method and a model.** Alignment and difference-finding are precise but cannot tell a scratch from a shadow or a wet patch. The model understands what it is looking at but can miss a small mark in a large image. Together, the classical step points and the model judges.

**What AI is not used for:** deciding to charge, setting prices, and deciding what a payment's status is.

**An evaluation set comes first.** Before any of this is trusted, collect pairs of photographs with known outcomes: no change, wear, and damage of several kinds, in good and poor light. Measure the pipeline against that set. Without it, there is no way to know whether a change made things better or worse.

**The set has two halves.** One is used for tuning. The other is never looked at while tuning, and its results are the ones published. See `extensions.md` section 5.

### 6.2 Agents

The extensions add four agents beside the owner's assistant, which is planned and not built. All that run inside Hold use `us.anthropic.claude-opus-4-5-20251101-v1:0` as deployed and the same tool gateway.

| Agent | Runs in | Tools | Acts on money |
|---|---|---|---|
| Owner's assistant (planned, not built) | web | Hold's read tools, PayPal's read tools, proposals | Only through a proposal the owner approves |
| Operations agent | worker, each night | The same read tools, proposals, template reminders | Only through a proposal the owner approves, or a standing rule the owner set |
| Shop's advocate | worker | Three moves: offer, accept, pass | Only inside the owner's settlement limits |
| Renter's advocate | worker | The same three moves | Only inside the renter's limit |
| A renter's own assistant | Outside Hold | Hold's MCP server | Never. The renter approves in PayPal. |

- **Effort:** medium for the advocates and for the operations agent's investigation, as deployed; reminders are templates and call no model.
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
- **Texts to renters** go through AWS End User Messaging SMS, by the `Texter` port in `packages/notify`, chosen over Twilio on 1 November 2026 to keep everything inside the AWS account. The client is the one new dependency. The account was in the SMS sandbox on 1 November 2026, with a monthly text spending limit of 1 USD and no sender number, sender name, verified destination or configuration set. Before a real text reaches a phone an administrator must: deploy HoldDelivery, whose permissions boundary now allows `sms-voice:SendTextMessage` and whose CloudFormation role may make the `hold-texts` configuration set and its topic; verify the destination numbers used for the demo (sandbox); get a sender for the countries texted (a sender name where the country allows one without registration; a registered number for the United States, which takes weeks); raise the spending limit; then set `"textReports": "on"` and, once there is one, `"textSender"` in `infra/cdk.json`. Until then a text fails, Hold uses email, and demo shops show their texts on the renter's page without sending.
- **Push notifications to the phone app** go through Expo's push service, by the `PushSender` port in `packages/notify` (`createExpoPushSender`), chosen on 1 November 2026 because the app is built with Expo and its service hands each push to Apple's and Google's with no client library: one HTTPS call, made with `fetch`. On the phone, `expo-notifications`, already a dependency, asks for permission and gives the Expo push token; no other dependency was added. The optional Expo access token ("enhanced push security"), once made, lets only Hold push to its phones; it is kept as the secret `hold/notify/expo-push-access-token`, named to the web app and the workers by `HOLD_PUSH_SECRET`, and read on the first push. Without it, pushes go with no token. What the owner does once, by hand: create the EAS project (`eas init`; done 1 November 2026, `@rogerjeasy/hold`, its id in `apps/mobile/app.config.ts`); upload an APNs key (`.p8`, with its key ID and team ID) to EAS for iOS, or let `eas credentials` make one; create a Firebase project for the Android package, upload its FCM V1 service account JSON to EAS, and build with the project's `google-services.json` (`GOOGLE_SERVICES_JSON`); and, optionally, turn on enhanced push security in Expo, make an access token and put it in the secret above. A build without a project id offers no notifications.
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
- **Every statement is a call.** On the Data API each statement, and the start and the end of each transaction, is an HTTPS call of its own that a page waits for in turn, so pages read in few statements: no row-by-row reads, figures gathered as subqueries of one statement, and reads that need not see one moment together run side by side, each in a transaction of its own bound to the caller's shop (`inShop`), so row-level security applies to every one. The frame of every shop page is one transaction of four statements (`personInShop`). `packages/db/src/page-statements.test.ts` pins the counts of the slowest pages.
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
- Point-in-time recovery switched on, with automated backups kept for 35 days, the most AWS allows. Backup storage up to the cluster's own size is free, so the longer window costs cents a month at most.
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

- **AWS CDK in TypeScript** defines every resource, so the environment can be recreated from the repository with the hand steps in `docs/deploy.md`. The code is in `infra/`. The account's existing CDK bootstrap is shared, and Hold's six stacks are `HoldData`, `HoldIdentity`, `HoldWork`, `HoldRegistry`, `HoldWeb` and `HoldDelivery`.
- **GitHub Actions** builds, tests and deploys, signing in to AWS through OpenID Connect with no stored keys. CI runs on every pull request; Deploy runs on main once CI passes (`architecture.md` section 20.2). The role is `hold-github-deploy`, in the HoldDelivery stack, and uses the account's existing GitHub identity provider.
- **AWS Secrets Manager** holds PayPal credentials and the AG Grid Enterprise licence key (`hold/web/ag-grid-licence`). Claude on Bedrock is reached with the task's IAM role, so no Claude key is stored.
- **Amazon CloudWatch** for logs, metrics and alarms. Every alarm reports to one SNS topic, `hold-alarms`, when it goes off and when it clears, and the topic emails the address the deploy names (`architecture.md` section 17.1). Deployed alarms, since 3 November 2026: a message set aside on any dead-letter queue, money work waiting more than 15 minutes on `paypal-events`, `executions` or `upkeep`, the outbox relay failing or not running for 15 minutes, and three or more server errors from the web app in five minutes. Alarms on holds about to lapse and on reconciliation differences need metrics of Hold's own, not yet published.
- **AWS Budgets** watches the account's monthly cost (`hold-account-monthly`) and tells the same topic at 80% and 100% spent and when the month is forecast to pass it.
- **App Runner's health check** is HTTP on `/api/health`, which answers without the database, so a paused cluster resuming never makes a healthy server look failed.
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
| **Bryntum** | The shop's calendar on Bryntum Scheduler: each item a row, each rental a bar marked by where its PayPal hold stands, read only, a bar opening its rental (`apps/web/src/features/calendar`) | Built, on the trial package (`@bryntum/scheduler@npm:@bryntum/scheduler-trial@7.3.7`), whose own browser build is served from `/vendor/bryntum` rather than bundled. Moves proposed by the operations agent are not built. Three winners. |
| **AG Grid** | Five grids on AG Grid Enterprise, themed from Hold's tokens and keyboard first. The decision board: every record waiting on a person, grouped by kind with each group's count and total (row grouping and aggregation), each decision opening in place into its evidence and actions (master-detail), and a right-click menu that only opens a decision, its claim page or its rental (`apps/web/src/features/decisions`). The open scorecard on `/reliability`: every pair of the accepted evaluation run grouped by kind with each group's record, each pair opening in place into its photographs, a filter of each column's values (set filter), and the pairs shown downloaded for a spreadsheet (Excel export) (`apps/web/src/features/open-scorecard`). The price list editor on `/shop/prices`: the next version as an editable grid where cells are chosen, copied and pasted like a spreadsheet (cell selection and clipboard), a kind chosen from a searchable list (rich select), rows added or removed from a right-click menu, and the draft downloaded for a spreadsheet (`apps/web/src/features/prices`). The money ledger on `/shop/money`: every line of the money log grouped by rental or by month with the grid's totals (row grouping and aggregation), each rental checked against its hold, its approved claim and PayPal, each line opening into what confirmed it (master-detail), and a download for the accountant (Excel export) (`apps/web/src/features/money`). The fleet passport on `/shop/items`: each item type above its items (tree data), with the types' totals (aggregation), each item's damage found rental by rental as a line of bars (sparklines, drawn by AG Charts), the item in each type wearing fastest, and a right-click menu to an item's passport, its status or its type's hold (`apps/web/src/features/items`). All five share one theme, one registration of Community modules, the opening of rows in place and the menus drawn over the page (`apps/web/src/components/grid`). The owner's insights dashboard on AG Studio, with the insights agent on AG Studio's agent framework, each model turn through Hold's server (`apps/web/src/features/insights`) | Built on `ag-grid-community`, `ag-grid-enterprise` and `ag-grid-react` 36.2.0, with `ag-charts-community` 14.2.0, which AG Grid's sparklines need to draw. AG Studio (`ag-studio` and `ag-studio-react` 3.0.0, on AG Grid 36.2 and AG Charts Enterprise 14.2) checks a licence of its own, AG Studio Core, Pro or Pro with AI; the insights agent needs Pro with AI, which the Grid and Charts key does not cover; that key was issued on 29 October 2026. Each grid registers only the Enterprise modules it uses. The Enterprise licence key is a trial key valid until 13 November 2026, read at runtime from `HOLD_AG_GRID_LICENCE_KEY`: locally from `apps/web/.env.local`, in CI from the `AG_GRID_LICENCE_KEY` repository secret, deployed from the `hold/web/ag-grid-licence` secret in Secrets Manager, which App Runner puts in the environment as the service starts. It reaches the browser, as AG Grid intends, and is never committed. Without a valid key the grids still work, with AG Grid's watermark off localhost and its notice in the console. The insights dashboard on `/shop/insights` runs on `ag-studio` 3.0.0's own browser build, served from `/vendor/ag-studio` and never bundled, with its licence key read at runtime from `HOLD_AG_STUDIO_LICENCE_KEY` (`apps/web/.env.local` locally, the `AG_STUDIO_LICENCE_KEY` repository secret in CI, the `hold/web/ag-studio-licence` secret when deployed); the trial key ends on 13 December 2026. The insights agent's model port and gate are in `packages/agent` and `packages/domain`. A project wins one sponsor prize. |
| **Postman** | Sandbox testing of the hold lifecycle, and a published collection for judges | Not built. No prize. |
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

**Trial licences.** AG Studio and Bryntum both offer a 45-day trial. Bryntum's trial package keeps its start under a `-trial-start` key, which reads as a clock per browser, so each judge's browser would start its own 45 days; this is read from the package, not confirmed with Bryntum (28 October 2026). A trial started before 31 October 2026 ends before judging closes on 15 December, and judges must be able to run the hosted demo throughout. Start both on or after 31 October, or ask each team on the PayPal Discord for a licence that runs through judging. What an expired trial does to the page has not been checked. Bryntum's trial is installed as `@bryntum/scheduler@npm:@bryntum/scheduler-trial`.

---

## 16. Things to settle on day one

Each of these should be tried against the real services before the build depends on it. The first four decide whether the core of Hold works as designed.

1. **The baseline hold.** Place a hold as its own authorize-first order, then void it, and separately capture part of one as the final capture. Confirm the remainder is released. This is the path every rental can use.
   **Confirmed in the sandbox on 14 October 2026, nine of nine checks.** The authorization's `expiration_time` is exactly 29 days after its `create_time`. After a final capture of 40.00 of a 150.00 CHF hold the authorization reads `CAPTURED`, a further capture is refused with `AUTHORIZATION_ALREADY_CAPTURED` and a void with `PREVIOUSLY_CAPTURED`. A voided hold refuses capture with `AUTHORIZATION_VOIDED`. Repeating a capture with the same `PayPal-Request-Id` returns the first capture with status 200 instead of 201. The authorization keeps showing the full amount after capture, so the remainder is known from the status, not from an amount.
2. **One approval for walk-ins.** PayPal does not allow an authorize-first order with more than one purchase unit, so the fee and deposit cannot be two parts of one order. The alternative is a single authorization for fee plus deposit, with the fee captured at once as a non-final capture. Confirm that the remainder stays held and can then be renewed and released. If it cannot, walk-ins approve twice.
   **Confirmed in the sandbox on 14 October 2026, ten of ten checks, except renewal.** After a 45.00 non-final capture of a 195.00 CHF authorization, it reads `PARTIALLY_CAPTURED`. A later 40.00 final capture succeeds and the authorization reads `CAPTURED`. Voiding instead succeeds and the authorization reads `VOIDED`, after which capture is refused. Walk-ins approve once. Renewal after a partial capture cannot be tried before day 4, so it is part of the two-step trial under item 3.
   **Built on 28 October 2026**, as a choice staff make for a same-day walk-in (architecture.md section 8.2), once trial 3 confirmed that a hold whose fee was captured renews for what is still held.
3. **Renewal.** PayPal allows renewal once per hold, from the fourth day, giving a new identifier. The sandbox refused a renewal on day 1 with `REAUTHORIZATION_TOO_SOON`: "A reauthorization is only allowed once from Day 4 to Day 29 since the date of the original authorization." The sandbox cannot fast-forward time, so renewal rules are tested against a fake PayPal with a controllable clock. One real renewal is also tried by waiting: `trial:renewal place` places a plain hold and a walk-in hold on day 1, and `trial:renewal renew` renews both after day 3 and records what the new and old identifiers allow. Hold renews only at the moment it charges, and falls back to capturing without a renewal, so `trial:renewal place-unrenewed` places a third hold on day 1 and `trial:renewal capture-unrenewed` captures it after day 3 with no renewal. Placed on 14 October 2026: E and F at 02:54 UTC, G later the same day.
   **Renewed live on 28 October 2026 (day 14), with `trial:renewal renew`.** Hold E renewed with a new identifier for the full 150.00 CHF; a second renewal of the new one was refused with `REAUTHORIZATION_NOT_SUPPORTED`; 40.00 was captured as the final capture on the new identifier, which then read `CAPTURED`. Three things differed from what the fake assumed, and the fake now does as PayPal did: the renewal's end of validity was one second after the original's, which Hold's renewal check refused, so a charge after day 3 would have retried forever (fixed: `keepsOriginalEnd` in `packages/domain/src/hold-placement.ts` allows a minute); the old identifier still accepted a capture after the renewal; and hold F, whose fee was captured from it first, refused a renewal sent with no amount (`AUTHORIZATION_AMOUNT_EXCEEDED`). Hold places no such hold today, so no code depends on that last one. The trial stopped at F before writing its recording.
   **Settled live on 28 October 2026 (day 14), with `trial:renewal void-after-renewal`, three of five checks as expected.** An original and its renewal share one life at PayPal. E's original, renewed and then captured in full on its renewal, reads `CAPTURED`, and a void of it is refused with `PREVIOUSLY_CAPTURED`. F, the walk-in hold whose 45.00 fee was captured from it, renewed for the 150.00 still held when the renewal named that amount (`renewHold` now takes one). Voiding F's original then voided the renewal too, and a capture on the renewal was refused with `AUTHORIZATION_VOIDED`. So the renter's money is reserved once, not twice, and Hold must never void an original while its renewal is to be charged: a test guards that (`return-settlement.test.ts`), and the fake now voids a renewal with its original and captures an original with its renewal.
4. **Comparison accuracy.** Photograph a real item before and after adding a small mark, in shop lighting, and run the pipeline. Do this before building any screens.
   The bare comparison, the model alone with no alignment, is `pnpm --filter @hold/eval compare:bare <handover photo> <return photo>`. It writes each result, with the model, prompt version, usage and the photographs' fingerprints, to `eval/results/`, which git ignores.
**How to run the first three.** Trials 1 and 2 are scripts that call the sandbox through Hold's PayPal adapter: `pnpm --filter @hold/paypal trial:baseline` and `pnpm --filter @hold/paypal trial:combined`. Each prints approval links for a sandbox personal account, waits, then prints a pass or fail per check and records PayPal's replies in `packages/paypal/trials/recordings/`, which git ignores. Trial 3 is the renewal tests in `packages/paypal/src/fake/fake-paypal.test.ts`. The fake marks the rules the sandbox has not yet confirmed.

5. **Saved payment methods for returning renters.** In production PayPal must approve the merchant for this. Treat it as optional.
6. **Dispute evidence in the sandbox.** Confirm that a test dispute can be opened and that evidence can be uploaded through the API.
   **Still open.** Since 28 October 2026 the operations agent's approved dispute answer goes to PayPal as evidence: `POST /v1/customer/disputes/{id}/provide-evidence`, a multipart form with the notes as JSON in `input` (`evidence_type` `OTHER`) and the rental's latest published evidence pack as a PDF in `evidence-file`, with the proposal as `PayPal-Request-Id` (`provideDisputeEvidence` in `packages/paypal/src/rest/disputes.ts`). The part names follow PayPal's reference and a public sample; they, the evidence type and the request-id deduplication are unconfirmed until a sandbox dispute is opened from the personal account and answered.
   **Tried live on 28 October 2026** with `trial:settlement dispute-evidence`, on a dispute the sandbox buyer opened against a trial fee ("not received", 9.00 EUR after a 1.00 refund). The dispute first read `UNDER_REVIEW` in PayPal's own review and was not in the `REQUIRED_ACTION` list; within minutes it read `WAITING_FOR_SELLER_RESPONSE`, `REQUIRED_ACTION`, naming the capture, with `provide_evidence` offered. The evidence type `OTHER` was refused with 400 `EVIDENCE_TYPE_IS_NOT_ALLOWED`. The same multipart form with `PROOF_OF_FULFILLMENT` was accepted (200), and the dispute then listed that evidence with `evidence-pack.pdf`, submitted by the seller, and moved to PayPal's review. So the part names are right, and the adapter now reads the dispute back and chooses the evidence type by its reason (`PROOF_OF_FULFILLMENT` for an item not received; `OTHER`, still unconfirmed, for any other reason). Since a new dispute can reach the shop only later, `CUSTOMER.DISPUTE.UPDATED` is subscribed and handled like `CREATED`. Still open: the evidence types other reasons take, and whether a repeated `PayPal-Request-Id` on provide-evidence returns the first answer.
7. **Camera behavior on phones.** Test resolution, focus and the installed web app on both iPhone and Android. Browsers differ.
8. **Object Lock.** It must be switched on when the bucket is created. It cannot be added later.
9. **Pay Later with a hold.** Pay Later may not be offered on an order that authorizes first. Treat it as optional.
10. **PayPal's MCP server from a server.** Connect an MCP client to the sandbox server with a shop's access token and no browser. List the tools and record their exact names.
    **Result, 26 October 2026.** It works over SSE: `https://mcp.sandbox.paypal.com/sse`, with the shop's OAuth access token (client credentials grant) as `Authorization: Bearer <token>`, using `SSEClientTransport` from `@modelcontextprotocol/sdk` 1.32.1. The documented streamable HTTP path `/http` answers 404, and `/mcp` answers 404 to a valid token. The server listed 46 tools: `create_invoice`, `create_recurring_series`, `activate_recurring_series`, `get_recurring_series`, `cancel_recurring_series`, `delete_recurring_series`, `list_invoices`, `get_invoice`, `send_invoice`, `send_invoice_reminder`, `cancel_sent_invoice`, `delete_invoice`, `setup_invoice_auto_reminders`, `update_invoice_auto_reminder`, `search_invoicing`, `update_invoicing`, `cancel_invoice_auto_reminder`, `generate_invoice_qr_code`, `generate_invoice_number`, `record_payment_for_invoice`, `record_refund_for_invoice`, `create_conditional_rules_for_invoice`, `create_product`, `list_products`, `update_product`, `show_product_details`, `create_subscription_plan`, `list_subscription_plans`, `show_subscription_plan_details`, `create_subscription`, `show_subscription_details`, `cancel_subscription`, `update_subscription`, `create_shipment_tracking`, `get_shipment_tracking`, `update_shipment_tracking`, `create_order`, `get_order`, `pay_order`, `list_disputes`, `get_dispute`, `accept_dispute_claim`, `list_transactions`, `create_refund`, `get_refund`, `get_merchant_insights`. A `list_transactions` call over the last week returned the account's report.
11. **The payer ID across shops.** Pay two different sandbox business accounts from one sandbox personal account and compare the payer IDs. The Clean Record's key depends on them matching.
12. **The approval event.** Approve an order from a bare link with no Hold page open, and confirm that `CHECKOUT.ORDER.APPROVED` arrives so the fee can be captured.
**Claim-settlement adapter validation, 20 October 2026.** Capture read-back, refunds and invoice creation/search/send are implemented through the existing PayPal port with strict recorded-response tests and the controllable fake. The implementation follows the official [Payments v2](https://developer.paypal.com/api/payments/v2/) and [Invoicing v2](https://developer.paypal.com/docs/api/invoicing/v2/) contracts. It does not assume Invoicing supports payment-style request deduplication: it searches a stable invoice number and validates claim reference, amount and currency before reuse. These new adapter paths have not been exercised against a live sandbox in this change; that validation remains outstanding alongside deployment, rather than being represented as a confirmed trial. **Confirmed live on 28 October 2026, with `trial:settlement pay-refund-invoice` on the demo's sandbox app, five of five checks:** a 10.00 EUR fee captured and named its payer; a 1.00 refund of it completed and read back for its capture; an invoice for 2.00 was created and sent to the payer, and asked again with the same number, Hold found that invoice instead of making a second. The participant also explicitly deferred deployment and live AI accuracy evaluation until later. No gate-half evaluation images were used.

**Evidence and receipt implementation, 20 October 2026.** Immutable pack publication and receipt delivery are implemented against local storage/mailer fakes, database guards and the existing verified PayPal-event paths. This adds no confirmed live PayPal trial. Deployment of the new Lambda roles/queues and the updated `HoldDelivery` policy, exact-version S3/Object Lock behavior on AWS, and the Linux PDFKit/sharp runtime bundle still need deployed verification. Local PDF rendering does not establish live comparison accuracy; the live AI evaluation remains deferred and no gate-half images were used.

**Real-service verification resumed, 22 October 2026.** [The verification record](verification/2026-10-22-core-real-services.md) distinguishes live provider observations from simulated inputs and unfinished scenarios. Initial checks confirmed PayPal sandbox credential acceptance, the live `hold_app` login with zero rows visible without scope, and the evidence bucket's 180-day GOVERNANCE Object Lock configuration. The stale administrative deployment policy was updated after review; worker/web rollout and the three rental scenarios are tracked separately. These preflight observations do not establish completed settlement, delivered receipts or comparison accuracy.

**Live worker startup, 22 October 2026.** Deployed empty-batch invocations exposed eager PDFKit initialization in the CommonJS media/comparison bundles. Failing startup tests preceded a photo-only evidence import fix. The corrected JavaScript was deployed with the CI-produced Linux native dependencies; both live handlers then returned an empty failure list without a Lambda function error. Evidence and receipt handlers also started successfully. The post-fix full check passed 160 files / 1,235 tests. These startup checks do not exercise image processing, model inference, PDF rendering, SMTP delivery or settlement.

**Operations and evidence workers, 3 November 2026.** The new dead-letter alarms showed the operations agent failing at start-up every night since 29 October (`createRequire` of an empty `import.meta.url`, from PDFKit and sharp bundled into its CommonJS code), and the evidence worker failing every sample rental's record (the sample photographs are not in the display bucket, and without `s3:ListBucket` S3 answers the missing key with Access Denied). Both workers' bundles were rebuilt locally and loaded in Node as Lambda does before the fix was deployed.

13. **An outside MCP client.** Connect one common MCP client to a stub of Hold's server with no sign-in step.
15. **Acting for a shop without holding its secret.** Today a shop pastes its own REST app's client ID and secret, which Hold keeps in Secrets Manager. The production plan is PayPal's partner model: the shop connects with one PayPal sign-in and Hold holds nothing (architecture.md section 8.1). Tried 28 October 2026 with `packages/paypal/trials/partner-onboarding.ts` on the demo's sandbox app:
    - **Partner Referrals v2** (`POST /v2/customer/partner-referrals`, third-party integration asking for payment, refund and dispute permissions) was refused with 403 `NOT_AUTHORIZED`, "insufficient permissions": the app has no partner permissions, which PayPal grants, not the developer.
    - **The payee named by email alone**, with no partner permission, gets most of the way: an authorize-first order paid to another sandbox business account was created, approved, authorized, read back as held for that account (its merchant ID on the authorization), and partly captured by Hold's app. But the void of what was left was refused with 403 `PERMISSION_DENIED`. A clean return could then never release the renter's money, so this model cannot carry Hold.
    So the one-sign-in connection waits on PayPal granting partner permissions to Hold's app; until then the shop's own REST app stays, behind the one credential-store interface the change would touch. Nothing in the code assumes the partner model.

14. **Bedrock access to Opus 5.5.** Tried 27 October 2026: the Marketplace agreements for Opus 5.5 and Opus 4.8 are accepted, but the account's applied quotas are zero (Service Quotas refuses a request below the 20 million default). Decided 27 October 2026: Hold runs on Opus 4.6 through judging (section 6), and the case is no longer waited on.

16. **The AG Grid licence through judging.** The Enterprise trial key AG Grid sent ends on 13 November 2026, the day after submissions close, and judging runs to 15 December. After that the three grids keep working, but show AG Grid's "Trial Period Expired" watermark to judges and write its notice to the console, which also fails CI's end-to-end tests of the decision board. Ask AG Grid, a sponsor of the hackathon, for a key that lasts through judging; it then goes into the `hold/web/ag-grid-licence` secret and the `AG_GRID_LICENCE_KEY` repository secret, and no code changes.

17. **PayPal's approval from the phone app.** A payment the app starts returns to Hold's https page `/api/mobile/v1/paypal-return/{kind}`, which answers `303` to `hold://paypal-return` (architecture.md section 13.8). Tested only against the simulated PayPal. Try with a sandbox personal account, on an iPhone and on an Android phone: that PayPal's sandbox accepts that return and cancel address and sends the renter to it from `expo-web-browser`'s in-app session, that the iOS session (ASWebAuthenticationSession) and the Android one (Custom Tabs) close on the `303` to the app's scheme, and whether a renter already signed in to PayPal in the phone's browser stays signed in inside the session. If a session does not close, the renter closes it and the app confirms all the same, so nothing is lost.

---

17. **Texts to renters (architecture.md section 12.3).** Not yet tried against AWS: that a sandbox account with a verified destination delivers a transactional text with no sender named, and with a sender name in Switzerland and Portugal; that the configuration set's SNS event destination sends `eventType`, `messageId`, `eventTimestamp` and the `context` Hold set, as `text-report.ts` reads them; that a number which replied STOP is refused with `ConflictException` reason `DESTINATION_PHONE_NUMBER_OPTED_OUT`; and that Android Chrome offers the code from the WebOTP line on Hold's App Runner host. The code handles each failing safely, by email.
18. **Push notifications to the phone app (architecture.md section 13.9).** Not yet tried on a device: no EAS project, APNs key or FCM V1 credentials exist yet. To confirm, on a development build of an iPhone and an Android phone: that the app receives a push for a rental and for the counter, in the foreground and in the background; that a tap from a cold start opens the right screen; that `getExpoPushTokenAsync` changes token after a reinstall, and the app registers the new one; that Expo's ticket and receipt answers, and its `DeviceNotRegistered` after the app is removed, are as the recorded answers in `packages/notify/src/recorded` (transcribed from Expo's documentation, not captured); that requests with the access token are accepted once enhanced push security is on, and requests without it refused; and that the Android notification icon draws from `assets/monochrome-icon.png`.
19. **Go live: partial capture on the shop's PayPal account.** For an authorization paid from a PayPal wallet, "you must enable partial capture on your PayPal account" ([Authorization and honor period](https://developer.paypal.com/payment-methods/auth-honor)). Every damage claim is a partial final capture of the hold, so a live shop's account needs it switched on before its first rental; the sandbox allowed it without the step. It is in `docs/deploy.md`'s list for a live shop; the connect flow does not check it.
20. **Go live: a card-funded hold may last less and may not renew.** Everything above was tried with wallet-funded holds. A hold the renter funds with a card is bounded by the card network's validity, not PayPal's 29 days: Visa's rules give equipment and bicycle rental 10 calendar days to clear or reverse an estimated authorization, and that authorization "does not include any amount covering potential damage" ([Visa Core Rules](https://usa.visa.com/content/dam/VCOM/download/about-visa/visa-rules-public.pdf) 5.7.2.4 and table 5-11). PayPal also defines `REAUTHORIZATION_NOT_SUPPORTED_FOR_PAYMENT_SOURCE` in its [Payments v2](https://developer.paypal.com/api/payments/v2/) error definitions, and reauthorization is described for PayPal-account payments, once only from day 4 to day 29 ([`REAUTHORIZATION_TOO_SOON`](https://developer.paypal.com/api/payments/v2/errors/reauthorization_too_soon)). So a card-funded hold may not be renewable at all. To try: a sandbox buyer whose only funding source is a test card, a hold past day 3, then a renewal, and record the error name here.

## 17. Access for judges

Judges do not have a bike to photograph, so the demo must work without one. They have no inbox Hold can send a code to either, so the demo must not need one.

- **A hosted demo** at a stable address: `https://p99faar3kp.us-east-1.awsapprunner.com`.
- **Real bikes to book.** Every demo shop has four City bikes beside its samples, so a judge can book one at the counter, on the shop's page or through the hosted assistant, and take it through a live sandbox hold.
- **A sample claim with its evidence.** The sample claim awaiting approval rests on a finding, with the handover and return photographs of the frame and the chip outlined, from a comparison marked as a sample.
- **A demo of each judge's own, with a one-tap sign-in.** One tap on the sign-in page opens a new Ribeira Bikes, busy with sample rentals, with two new accounts: Tomás the owner and Jonas at the counter. A judge types nothing and waits for no code, sees no other judge's demo, and can switch between Tomás and Jonas from the same browser. A step that moves money still asks for a passkey, which the judge adds on their own device. How it works and what it allows are in `architecture.md` section 20.3.
- **Matching sandbox PayPal accounts.** Every demo shop shares one sandbox business account, which an administrator stores once with `pnpm demo:paypal`. A sandbox personal account plays the renter; its sign-in is in the submission's testing instructions.
- **Sample photograph sets** built into the demo, one for each return a judge may want to see. The handover uses the frame as handed over, which has a faint scuff on the down tube. At the return, one tap loads one of three samples in place of the camera: the same photograph again (a clean return), the frame with a chip in the paint (damage), or the frame with the scuff grown into a scratch through the paint (a contested claim). In the sandbox a confirmed finding from them may be billed, so a damaged return can reach a real sandbox capture (`architecture.md` section 20.3). The independent second look confirmed the chip in 2 of 10 runs on Opus 4.6 when its crops kept 3 percent of the photograph around the finding. Unsure of a featureless tube, it said new damage but below 0.9 confidence. With a tenth of the photograph around the finding (`SECOND_LOOK_MARGIN`, prompt version `inspection-2`) it confirmed the chip in 8 of 8 runs on 28 October 2026, and the contested sample still went to a person in 3 of 3. These are runs on the demonstration's own pair, not a measurement: the evaluation set has none yet. When the second look is not sure, the finding waits for a person, who claims it with a written reason. The contested sample is built so that each side has a case: the wear policy says a mark recorded at the handover is never charged again, and the scratch runs on from that mark but is longer and through the paint.
- **The real camera path** also works, for a judge who wants to try it on any object to hand.
- **Nothing to reset.** Each demo starts from the same state, so judges never see each other's changes.
- **Full setup instructions** in the repository's README.
- **A hosted assistant** that books through Hold's MCP server, so a judge can see an AI assistant rent a bike without setting anything up. In the browser that started a demo, it rents from that demo's own shop, which no assistant can otherwise find.
- **The MCP server's address** in the README, for a judge who wants to connect their own assistant.

---

## 18. Cost and running through judging

- The environment must stay up from submission on 12 November until judging ends on 15 December 2026.
- Keep the App Runner service small and Aurora's maximum capacity low. Aurora's minimum is zero, which would let it pause when idle, but in practice it does not pause: Aurora pauses only after five minutes with no connection, and the outbox relay queries the database every minute (`rate(1 minute)`, `infra/lib/worker.ts`). CloudWatch's `ServerlessDatabaseCapacity` read a flat 0.5 capacity units in every six-hour window from 27 October to 3 November 2026, about 44 USD a month and most of Hold's own AWS cost. The relay's cadence stays: it is the backstop that sends an approved capture or release whose first send failed, and that reads a money execution PayPal left waiting back from PayPal. Decided 27 October 2026: the minimum is raised to 0.5 for the judging weeks, 1 to 15 December, by a deploy on 1 December and another on 16 December that sets it back (`DATABASE_MIN_CAPACITY` in `infra/lib/settings.ts`), so that a pause, should the relay ever stop, cannot make a judge wait for the database to resume. Making Aurora pause would need the relay to skip the database when nothing waits, for example by triggering on the outbox's own queue sends instead of a clock; that is not built.
- The web app runs on 2 vCPU and 4 GB through judging, decided 4 November 2026, with one instance always provisioned, after shop pages took 1.4 to 3.5 seconds to their first byte on 1 vCPU and 2 GB. An idle provisioned instance is billed for its memory only, about 20 USD a month at 4 GB; a second warm one would double that for traffic one carries, so the minimum stays at one and the maximum at two (`infra/lib/web-stack.ts`). After 15 December it goes back to 1 vCPU and 2 GB.
- The account's monthly budget, `hold-account-monthly`, is 100 USD unless the deploy names another with `-c monthlyBudgetUsd=<amount>` (`MONTHLY_BUDGET_USD` in `infra/lib/settings.ts`). No figure was set before 3 November 2026; Hold's own share is small (one App Runner instance, Aurora at 0.5 capacity units around the clock, Lambda and queues at demo traffic, Claude for the demo), but the budget is the whole account's, which Wick and CareCircle share, so it is raised to cover them. A budget on Hold's tag alone would read nothing until the tag is activated for cost allocation.
- Set a spending limit on the Claude account. Image comparison uses more tokens than text, and the demo is public.
- Each operations agent run and each negotiation has its own ceiling on calls and tokens.
- The public demo has daily caps across every network (`architecture.md` section 20.3): a hundred demo starts a day, which keeps the user pool under Cognito Essentials' 10,000 free monthly active users, and a hundred hosted-assistant questions a day, which keeps the assistant to half of the agents' daily Opus 4.5 tokens (taken as 6,000,000, under the 6,750,000 Service Quotas lists); the sample comparisons on Opus 4.6 stay within two thirds of its day (about 940,000, measured when they ran out on 29 October 2026; Service Quotas does not list that limit). Demos are retired after seven days and their two users removed by a daily cleanup, so the pool holds at most a week of them.
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
