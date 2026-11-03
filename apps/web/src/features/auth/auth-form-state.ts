import type { AuthField, Problems } from './auth-input'
import type { CodeProblem } from './code-input'
import type { DemoNotice } from './demo-session'
import type { CodeFailure, FlowNotice } from './sign-in-flow'

// What the server answers a submitted form with. The form shows it as it is. A good submission moves on to the
// next step instead, so it has no answer here.
export type AuthFormState = {
  // What was typed, handed back so the fields keep it.
  values: Partial<Record<AuthField, string>>
  problems: Problems
  notice?: FlowNotice
}

export type AuthAction = (previous: AuthFormState, data: FormData) => Promise<AuthFormState>

export const initialAuthFormState: AuthFormState = { values: {}, problems: {} }

export type CodeFormState = { problem?: CodeProblem | CodeFailure; resent?: boolean }

export type CodeAction = (previous: CodeFormState, data: FormData) => Promise<CodeFormState>

export const initialCodeFormState: CodeFormState = {}

// What the server answers the passkey steps with. The browser does the part in between.
export type PasskeyFormState = {
  problem?: CodeFailure | CodeProblem | 'email' | 'confirm_first'
  // WebAuthn's JSON, for navigator.credentials.get or create.
  requestOptions?: string
  creationOptions?: string
  registered?: boolean
}

// What the server answers a tap on a demo account with. A good tap moves on to the shop instead.
export type DemoFormState = { notice?: DemoNotice }

export const initialDemoFormState: DemoFormState = {}
