// What one side must never read, as a pattern over the JSON it is sent: field names, and amounts that count only as a
// number of their own, since a move's fingerprint is a hash and an id is random, and either may hold the same digits.
export function mentionOf(fragments: readonly string[], amounts: readonly number[] = []): RegExp {
  return new RegExp([...fragments, ...amounts.map((cents) => `(?<![\\w-])${String(cents)}(?![\\w-])`)].join('|'))
}
