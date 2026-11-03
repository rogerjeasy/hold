import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { errorForLog } from './log-redaction.ts'

// What reaches a log about an error (AGENTS.md section 7): only what is known to be safe, never free text. A message
// from the database or a provider can carry a renter's name, an email or a token in a shape no pattern foresees.
describe('an error for a log', () => {
  it('gives the name and the stack frames, and never the message', () => {
    const error = new Error('No renter for ana@example.com, token=A21AAFEpH4PsZ9xVn')
    error.name = 'RenterMissing'
    const logged = errorForLog(error)
    expect(logged).toMatch(/^RenterMissing/)
    expect(logged).toMatch(/\n\s+at /)
    expect(logged).not.toContain('ana@example.com')
    expect(logged).not.toContain('A21AAFEpH4PsZ9xVn')
    expect(logged).not.toContain('No renter')
  })

  it('keeps the codes a reader needs, and a failed query’s text without its values', () => {
    const cause = Object.assign(new Error('duplicate key value violates unique constraint\nDETAIL: Key (email)=(ana@example.com) already exists.'), { name: 'DatabaseError', code: '23505', constraint: 'renters_email_unique' })
    const error = Object.assign(new Error('Failed query: insert into renters (name, email) values ($1, $2)\nparams: Ana Silva,ana@example.com', { cause }), { name: 'DrizzleQueryError', query: 'insert into renters (name, email) values ($1, $2)', params: ['Ana Silva', 'ana@example.com'] })
    const logged = errorForLog(error)
    expect(logged).toContain('DrizzleQueryError query="insert into renters (name, email) values ($1, $2)"')
    expect(logged).toContain('Caused by DatabaseError code=23505 constraint=renters_email_unique')
    expect(logged).not.toContain('Ana Silva')
    expect(logged).not.toContain('ana@example.com')
  })

  it('leaves out a code or a constraint that is not a plain identifier', () => {
    const error = Object.assign(new Error('x'), { code: 'ana@example.com', constraint: 'Key (email)=(a@b.c)', status: 'four hundred' })
    const logged = errorForLog(error)
    expect(logged).not.toContain('ana@example.com')
    expect(logged).not.toContain('a@b.c')
    expect(logged).not.toContain('four hundred')
  })

  it('keeps an HTTP status', () => {
    expect(errorForLog(Object.assign(new Error('Not found'), { name: 'APIError', status: 404 }))).toMatch(/^APIError status=404/)
  })

  it('never lets any message through, whatever it holds', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (text) => {
        const marked = `MSG-7f3a-${text}`
        expect(errorForLog(new Error(marked, { cause: new Error(marked) }))).not.toContain('MSG-7f3a-')
      }),
    )
  })

  it('stops at a cause that refers back to itself', () => {
    const error = new Error('loop')
    Object.assign(error, { cause: error })
    expect(errorForLog(error).match(/Caused by/g)?.length ?? 0).toBeLessThanOrEqual(3)
  })

  it('names only the kind of something thrown that is not an error', () => {
    expect(errorForLog('failed for ana@example.com')).toBe('a string was thrown')
    expect(errorForLog(undefined)).toBe('a undefined was thrown')
  })
})
