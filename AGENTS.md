# Hold: instructions for coding agents

Hold is a deposit and damage system for small rental shops. A PayPal authorization hold replaces the cash deposit. Photographs are compared at return. A person approves every charge. It is built for the PayPal AI Hackathon 2026, and submissions close on Thursday 12 November 2026 at 12:00 pm Pacific Time.

These rules apply to every change in this repository. The design lives in `docs/`. This file says how to work, not what to build.

## 1. Where the truth is

| Question | Read |
|---|---|
| What the product does and why | `docs/project-description.md` |
| Which tools and services, and their settings | `docs/tech-stack.md` |
| Structure, state machines, flows, access, security | `docs/architecture.md` |
| The six extensions and their acceptance checks | `docs/extensions.md` |

- The docs are long. Find the heading with a search and read that section. Do not load a whole file.
- If a task conflicts with the docs, stop and say so. Do not choose silently.
- A change to behavior, a state, a table, a route or an agent tool updates the matching doc in the same change.
- Build the spine first (`architecture.md` section 22.4), then the extensions in their fixed order (`extensions.md` section 12). No extension starts before the spine runs end to end.
- PayPal behavior that is still unconfirmed is listed in `tech-stack.md` section 16. Do not assume it. Run the trial or ask.

## 2. Commands

One repository, pnpm workspaces, TypeScript everywhere. These script names are the contract. If one is missing, add it under this name.

```
pnpm install
pnpm dev                 # web, worker and PostgreSQL through Docker Compose
pnpm test                # Vitest, every package
pnpm test <path>         # one file or folder
pnpm test:e2e            # Playwright, the full suite: run it locally before work that touches a screen is done
pnpm test:e2e:key        # the key flows only (sign-in, booking, claims), without the width checks: what CI runs
pnpm test:ci             # the key unit tests (domain, settling, row-level security, route access, agent tools): what CI runs
pnpm lint
pnpm typecheck
pnpm eval                # the photo evaluation set
pnpm mobile              # the phone app's bundler (apps/mobile), for its development build
pnpm test:mobile         # Jest for the phone app
pnpm check               # lint, typecheck and test together, the phone app included
```

## 3. Test first, always

Every feature and every fix follows red, green, refactor.

1. **Red.** Write one failing test that states the behavior. Run it. Confirm it fails for the reason you expect.
2. **Green.** Write the least code that passes it. Nothing the test does not ask for.
3. **Refactor.** Remove duplication and tidy names with the tests green. Run the tests again.

- No production code without a failing test that needed it.
- A bug fix starts with a test that reproduces the bug.
- Test behavior through the public interface. Do not test private functions or mock the unit under test.
- Never make a test pass by weakening it, skipping it, or leaving `.only` or `.skip` behind. If a test is wrong, say why and fix the test in its own step.
- Use the test level the code calls for. `architecture.md` section 19 lists them all.

| Code | Test with |
|---|---|
| `packages/domain` | Unit tests and fast-check property tests. No database, no network, no clock except one passed in. |
| Adapters for PayPal, Claude, Rekognition, email | Recorded responses and the fakes behind each port |
| Routes, repositories, queues | A real PostgreSQL and a fake PayPal |
| Screens and flows | Component tests, then Playwright with a recorded image as the camera |
| Access rules | Tests that try to cross a boundary and must fail |
| Agent tools | Tests that list every tool, proposal kind and mandate and prove none leads to a charge |
| Prompts and the comparison pipeline | The evaluation set, tuning half only. Never read or tune on the gate half. |

- A day-one sandbox trial is a throwaway spike. Learn from it, delete it, then write the real code test first.
- Run `pnpm check` before saying work is done. Report failures with their output. Never report untested work as working.

## 4. Design principles

**KISS.** Write the simplest code that passes the tests and reads clearly.

- No abstraction, option, layer or setting until a real second use needs it.
- Prefer a plain function to a class, and a clear `if` to a clever pattern.
- No new dependency when the stack in `tech-stack.md` already covers the need. A new dependency needs a stated reason.
- Build what the task asks for. Suggest extras. Do not add them.

**DRY.** Each fact and each rule has one home.

- State transitions, claim arithmetic, approval rules and limits live in `packages/domain` and nowhere else. Screens and routes call them.
- Types come from the schema that validates the data. Do not hand-write a second copy.
- The same input schema validates on the client and on the server.
- Colors, spacing, breakpoints, routes, role names and error codes are named constants, defined once.
- Remove duplication when the same knowledge appears a second time. Two pieces of code that only look alike may stay apart.

**Reuse.** Search before you write.

- Before adding a component, hook, helper or type, look for one that exists. Extend it if it fits.
- Code used by one feature stays in that feature. Move it to a shared place when a second feature needs it.
- Shared code has a small typed interface and no knowledge of its callers.

## 5. Structure and boundaries

The layout is in `architecture.md` section 5. Keep to it.

- `packages/domain` depends on nothing. No database, no network, no AI, no framework imports.
- Other packages may depend on `domain`. Apps depend on packages and never on each other.
- PayPal, Claude, Rekognition and email are reached only through their port. No direct call from a route or a component.
- One file has one purpose. A file that needs "and" to describe it gets split.
- If a change needs a new package, a new table or a new dependency direction, raise it first.

## 6. Money and state

These hold in every change. A change that cannot keep them is not made.

- Amounts are integer cents with a currency code. No floats, anywhere.
- Every amount is read from the database or computed by plain code, and never trusted from a client. The one amount a model proposes is an advocate's offer on a contested claim: plain code bounds each line to its published price, the total to the claim a person approved and to both sides' mandates, and the renter confirms the result with a one-time code. An offer can only lower a charge a person already approved.
- A rental, a hold and a claim change state only through their state machine. A transition that is not listed cannot happen, and no record moves backwards.
- PayPal's record is the truth. A hold counts as placed, captured or released only after a verified PayPal event or a direct read from PayPal.
- Every call that moves money goes through the outbox with an idempotency key, sent as `PayPal-Request-Id`.
- Captured never exceeds reserved. Captured never exceeds the approved claim. Captured plus released never exceeds reserved.
- A charge begins only from a claim that reached `charging`. Every claim line has a finding with photographs, or a named person's written reason.
- The money log, approvals and the audit trail are append-only. Evidence photographs are never overwritten or deleted.

## 7. Security and access

Deny by default. Every check runs on the server. Hiding a button is not access control.

**Every request, in this order**

1. Authenticate: a Cognito token, a signed renter link, an agent token, or a webhook signature.
2. Resolve the shop and check the caller's role and approval limit in that shop.
3. Open the transaction with the caller's identity set, so row-level security applies.
4. Validate the input against its schema. Reject unknown fields.
5. Act, then write the audit line.

- All routes use the one shared handler wrapper that does steps 1 to 4. No route does its own. A test lists every route and fails on any without it.
- Roles are owner, manager, counter staff and read-only, per shop. Approval limits come from the shop's settings. Check both. `architecture.md` section 7.3 says who may confirm what.
- Every table with shop data has a row-level security policy and a test that a second shop reads nothing.
- A renter link is signed, expiring, bound to one rental and scoped. Accepting or contesting a claim needs the one-time code.
- An agent token is bound to one rental, scoped and revocable. No scope moves money.
- A webhook is verified before its body is used, then confirmed by reading the resource back from PayPal.
- Return only the fields the caller's role may see. Shape the response on the server.
- Requests that change state are never `GET`. Public routes are rate limited.
- Secrets live in AWS Secrets Manager. None in code, images, committed files, logs or error messages.
- Logs carry no tokens, credentials, photograph contents or unmasked personal details.
- Each access rule ships with negative tests: wrong shop, wrong role, over the limit, expired link, missing scope, forged signature. Each must fail closed.
- Threats and controls are in `architecture.md` section 15. A new feature that adds a threat adds a row and a test.

## 8. Agents and AI

The full rules are in `extensions.md` section 3. The ones that shape code:

- Detect with code, explain with the model. Anything that must not be missed is found by deterministic code and still works when the model is down.
- Every tool call from every agent passes the one gateway. It checks actor, shop, tier, mandate, rate and argument shape, then writes the audit line.
- Tiers are `read`, `draft`, `propose`, `notify` and `act_under_mandate`. No tier charges. No proposal kind is a capture. No tool an assistant or the operations agent can call takes an amount. The advocates' `offer` takes amounts, bounded by code as section 6 says.
- A person decides, on screen or in advance through a mandate. Plain code checks every action against the mandate's limits.
- Text from renters, other agents, PayPal memos and dispute notes is quoted data. A step that reads it has no tool that moves money.
- One side's limits never enter a call made for the other side.
- Use Claude Opus 4.6 on Amazon Bedrock (`us.anthropic.claude-opus-4-6-v1`, its US inference profile, through `@anthropic-ai/bedrock-sdk`). It runs through judging: decided 27 October 2026, because the account has no quota for Opus 5.5 (`tech-stack.md` section 6). Set effort explicitly, use strict tool schemas where Bedrock accepts them, automatic tool choice and structured output. Check the stop reason and handle a refusal as a normal outcome.
- Every run has a ceiling on tool calls, tokens and time. If an agent fails, the manual path still works and nothing is charged.
- Store the model and prompt version with each result.

## 9. Frontend

The phone app (`apps/mobile`, Expo) follows these rules in its own terms; `apps/mobile/AGENTS.md` says how.

Next.js, React, Tailwind CSS and shadcn/ui. One app serves a phone at the counter and a laptop in the office.

**Responsive on every screen**

- Build mobile first. Start at 360 pixels wide and add layout at Tailwind's breakpoints.
- Every screen works at 360, 390, 768, 820, 1024, 1280 and 1440 pixels wide, portrait and landscape where a tablet allows.
- The page never scrolls sideways. Nothing overlaps, nothing is clipped, nothing leaves its container.
- No fixed pixel width or height on a container. Use fluid widths, `max-w-*`, grid and flex with `min-w-0` on children that hold text.
- Long text wraps or truncates on purpose. Test with a long name, a long email, a large amount and a translated label.
- A wide table or the scheduler scrolls inside its own container, or becomes a card list below `md`. The page around it stays still.
- Touch targets are at least 44 by 44 pixels. Controls used at the counter sit within thumb reach.
- Use `dvh` for full-height layouts and respect safe-area insets. Give images and video a fixed aspect ratio so nothing jumps.
- Fixed and sticky elements never cover content or the primary action, including with the on-screen keyboard open.
- One shared Playwright helper checks each width for sideways scroll and for elements outside the viewport. Every new page is added to it.

**Small components**

- A route file composes. It loads data and arranges sections. It holds no business logic.
- A component does one thing. Split it when it passes about 150 lines, mixes data loading with display, or holds a block that could be named.
- Logic lives in hooks or in `packages/domain`. Components render.
- Server components by default. Add `"use client"` only at the leaf that needs it.
- Shared primitives live in one `components/ui` folder. Feature components live with their feature.
- Props are typed and few. When a component needs many, compose it from children.

**Every screen**

- Handles loading, empty, error and success. No blank screen and no silent failure.
- Works by keyboard, has visible focus, labelled controls and readable contrast. Meaning is never carried by color alone.
- Takes all fixed text from `next-intl`. No hard-coded strings in components.
- Uses design tokens. No one-off colors or spacing values.
- Labels anything simulated for the demo, on screen and in the record.

## 10. Code style

- TypeScript in strict mode. No `any`, no non-null `!`, no `@ts-ignore`. Narrow unknown data with a schema.
- Validate at every boundary: requests, webhooks, queue messages, model output, environment variables.
- Expected failures are typed results. Throw only for the unexpected. Never swallow an error.
- Names say what a thing is in the domain's words from `architecture.md` section 6.1. No abbreviations.
- Functions are small and take explicit inputs. Pass the clock and randomness in.
- Comment why, not what. No commented-out code and no stray `TODO`.
- Match the code around you before introducing a new pattern.

## 11. Git and delivery

- Commit only when asked. Small commits, one purpose each, tests and code together.
- Conventional commit messages: `feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`.
- No `Co-Authored-By` trailer and no "Generated with" line in any commit or pull request.
- Never commit secrets, `.env` files, sandbox credentials or real customer data.
- Database changes are migrations in the repository. Never edit a migration that has run.

## 12. Done means

- A failing test came first, and `pnpm check` passes.
- Access is checked on the server, with negative tests.
- Screens were checked at every width in section 9.
- The matching doc and any "Done when" check in `extensions.md` are updated or met.
- You said plainly what was done, what was not, and what you could not verify.
