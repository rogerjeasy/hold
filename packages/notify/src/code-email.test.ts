import { describe, expect, it } from 'vitest'
import { codeEmail } from './code-email.ts'

describe('the email that carries a sign-in code', () => {
  it('names the code and what to do with it, in plain text', () => {
    const email = codeEmail('ana@lisboa.example', '24681357')

    expect(email.to).toBe('ana@lisboa.example')
    expect(email.subject).toBe('Your Hold code')
    expect(email.text).toContain('Your Hold code is 24681357.')
    expect(email.text).toContain('If you did not ask for it, you can ignore this email.')
  })
})
