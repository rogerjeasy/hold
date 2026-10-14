// The code from the email. Cognito's confirmation codes have six digits and its sign-in codes eight. The browser and
// the server check it with this one function. Spaces a person types or pastes are ignored.
export type CodeProblem = 'missing' | 'invalid'

const CODE_SHAPE = /^\d{6,8}$/

export function parseCode(input: unknown): { ok: true; code: string } | { ok: false; problem: CodeProblem } {
  const code = typeof input === 'string' ? input.replace(/\s+/g, '') : ''
  if (code === '') return { ok: false, problem: 'missing' }
  return CODE_SHAPE.test(code) ? { ok: true, code } : { ok: false, problem: 'invalid' }
}
