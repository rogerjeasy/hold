import { randomBytes } from 'node:crypto'

// What every demo session's two accounts share (architecture.md section 20.3). Each judge who starts a demo gets
// accounts of their own, made by the web app; their passwords exist only in that judge's browser, sealed.

// Where every demo session's accounts live: a reserved domain, so no mail is ever sent to one.
export const DEMO_SESSION_DOMAIN = 'demo.hold.example'

export const DEMO_ACCOUNT_KEYS = ['owner', 'staff'] as const
export type DemoAccountKey = (typeof DEMO_ACCOUNT_KEYS)[number]

// Random, and always meeting Cognito's default policy: upper and lower case, a digit and a symbol.
export function newDemoPassword(): string {
  return `${randomBytes(24).toString('base64url')}Aa1!`
}
