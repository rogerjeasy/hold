// What the sign-in and sign-up forms accept. The browser and the server both check input with this one function.
export const signInFields = ['email'] as const
export const signUpFields = ['name', 'shopName', 'email'] as const

export type AuthField = (typeof signUpFields)[number]
export type FieldProblem = 'missing' | 'invalid'
export type Problems = Partial<Record<AuthField, FieldProblem>>

export type Parsed<Field extends AuthField> = { ok: true; value: Record<Field, string> } | { ok: false; problems: Problems }

const MAX_NAME_LENGTH = 100
// The longest address a mail server accepts.
const MAX_EMAIL_LENGTH = 254
// One @, no spaces, and a dot in the domain. Whether the address exists is settled by sending the code to it.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function checkName(value: string): FieldProblem | undefined {
  if (value === '') return 'missing'
  return value.length > MAX_NAME_LENGTH ? 'invalid' : undefined
}

function checkEmail(value: string): FieldProblem | undefined {
  if (value === '') return 'missing'
  return value.length > MAX_EMAIL_LENGTH || !EMAIL_SHAPE.test(value) ? 'invalid' : undefined
}

const checks: Record<AuthField, (value: string) => FieldProblem | undefined> = {
  name: checkName,
  shopName: checkName,
  email: checkEmail,
}

// Anything that is not text counts as nothing typed. Text is read without the space around it.
export function readText(input: unknown): string {
  return typeof input === 'string' ? input.trim() : ''
}

// Reads only the named fields, so anything else that was sent is dropped.
export function parseAuthInput<Field extends AuthField>(fields: readonly Field[], input: Readonly<Record<string, unknown>>): Parsed<Field> {
  const value = Object.fromEntries(fields.map((field) => [field, readText(input[field])])) as Record<Field, string>
  const problems: Problems = {}
  for (const field of fields) {
    const problem = checks[field](value[field])
    if (problem !== undefined) problems[field] = problem
  }
  return Object.keys(problems).length === 0 ? { ok: true, value } : { ok: false, problems }
}
