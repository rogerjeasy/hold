import { describe, expect, it } from 'vitest'
import { checkContestSummary } from './contest-summary.ts'

const comment = 'It was already there when I picked it up. I didn’t touch that part of the frame.'
const lineIds = ['line-scratch', 'line-light']
const version = (overrides: Record<string, unknown> = {}) => ({
  overview: 'The renter disputes the scratch on the frame and says it was there at pickup. The lost front light is not disputed.',
  lines: [
    { lineId: 'line-scratch', disputed: true, shopSays: 'The comparison found a new scratch and a second look confirmed it.', renterSays: 'She says the damage was there before her rental.', renterQuote: 'It was already there when I picked it up.' },
    { lineId: 'line-light', disputed: false, shopSays: 'Added by staff with a written reason.', renterSays: null, renterQuote: null },
  ],
  ...overrides,
})
const answer = (shop = version(), renter = version()) => ({ forShop: shop, forRenter: renter })

describe('the summary of a contest, as plain code accepts it', () => {
  it('keeps a summary that covers every line once, in both versions', () => {
    const checked = checkContestSummary(answer(), { lineIds, comment })
    expect(checked.ok).toBe(true)
    if (checked.ok) expect(checked.value.forShop.lines.map((line) => [line.lineId, line.disputed])).toEqual([['line-scratch', true], ['line-light', false]])
  })

  it('refuses a summary that leaves out a line, adds one, or disputes different lines for each side', () => {
    expect(checkContestSummary(answer(version({ lines: [version().lines[0]] })), { lineIds, comment })).toEqual({ ok: false, error: 'invalid' })
    expect(checkContestSummary(answer(version({ lines: [...version().lines, { ...version().lines[1], lineId: 'invented' }] })), { lineIds, comment })).toEqual({ ok: false, error: 'invalid' })
    const otherSide = version({ lines: version().lines.map((line) => ({ ...line, disputed: !line.disputed })) })
    expect(checkContestSummary(answer(version(), otherSide), { lineIds, comment })).toEqual({ ok: false, error: 'invalid' })
  })

  it('drops a summary that names a number of any kind, since no amount may come from a model', () => {
    expect(checkContestSummary(answer(version({ overview: 'The renter disputes the €35 scratch.' })), { lineIds, comment })).toEqual({ ok: false, error: 'dropped' })
    expect(checkContestSummary(answer(version(), version({ overview: 'You dispute two lines.' })), { lineIds, comment })).toEqual({ ok: false, error: 'dropped' })
  })

  it('keeps a quote only when it is the renter’s own words, exactly', () => {
    const invented = version({ lines: [{ ...version().lines[0], renterQuote: 'The shop scratched it.' }, version().lines[1]] })
    const checked = checkContestSummary(answer(invented), { lineIds, comment })
    expect(checked.ok && checked.value.forShop.lines[0]?.renterQuote).toBe(null)
    const spaced = version({ lines: [{ ...version().lines[0], renterQuote: 'It was  already there\nwhen I picked it up.' }, version().lines[1]] })
    const kept = checkContestSummary(answer(spaced), { lineIds, comment })
    expect(kept.ok && kept.value.forShop.lines[0]?.renterQuote).toBe('It was already there when I picked it up.')
  })
})
