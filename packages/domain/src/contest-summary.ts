import { guardNumbers } from './number-guard.ts'
import { fail, ok } from './result.ts'
import type { Result } from './result.ts'

// A neutral summary when a renter contests a claim (architecture.md section 6.15). Plain code finds the facts and lays
// out the claim line by line, the shop's side of each line in the record's own words; one model call only puts what the
// renter says into plain words, beside an overview. These rules decide whether its
// answer counts: it covers every line once, both versions agree on which lines are disputed, it names no number at all,
// and a quote of the renter is kept only when it is their own words.

export const CONTEST_SUMMARY_LIMITS = { overviewLength: 500, textLength: 300, maxTokens: 2_048, maxMilliseconds: 30_000 } as const

// No line carries the shop's side: a model reading the renter's words never speaks for the shop.
export type ContestSummaryLine = { readonly lineId: string; readonly disputed: boolean; readonly renterSays: string | null; readonly renterQuote: string | null }
export type ContestSummaryVersion = { readonly overview: string; readonly lines: readonly ContestSummaryLine[] }
// The same summary for the person deciding, in the shop's language, and for the renter, in theirs. Neither side is
// told something the other is not. Its shape is checked against a strict schema before it reaches these rules.
export type ContestSummary = { readonly forShop: ContestSummaryVersion; readonly forRenter: ContestSummaryVersion }

// Spaces, line breaks and quotation marks differ between what a renter typed and what a model copies out.
const plain = (words: string) => words.replace(/[“”"«»„]/g, '').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim()

export function checkContestSummary(summary: ContestSummary, record: { readonly lineIds: readonly string[]; readonly comment: string }): Result<ContestSummary, 'invalid' | 'dropped'> {
  const { forShop, forRenter } = summary
  const expected = [...record.lineIds].sort()
  for (const version of [forShop, forRenter]) {
    const named = version.lines.map((line) => line.lineId).sort()
    if (named.length !== expected.length || named.some((id, index) => id !== expected[index])) return fail('invalid')
  }
  const disputed = (version: ContestSummaryVersion) => version.lines.filter((line) => line.disputed).map((line) => line.lineId).sort().join(',')
  if (disputed(forShop) !== disputed(forRenter)) return fail('invalid')
  const words = [forShop, forRenter].flatMap((version) => [version.overview, ...version.lines.map((line) => line.renterSays ?? '')])
  if (words.some((each) => each !== '' && guardNumbers(each, []) === null)) return fail('dropped')
  const renterWords = plain(record.comment)
  const quoted = (version: ContestSummaryVersion): ContestSummaryVersion => ({
    ...version,
    lines: version.lines.map((line) => {
      const quote = line.renterQuote === null ? null : plain(line.renterQuote)
      return { ...line, renterQuote: quote !== null && quote !== '' && renterWords.includes(quote) ? quote : null }
    }),
  })
  return ok({ forShop: quoted(forShop), forRenter: quoted(forRenter) })
}
