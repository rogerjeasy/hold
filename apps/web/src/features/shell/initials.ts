// The letters shown in place of a picture: the first letters of the first and last words.
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => word !== '')
  const first = words[0]
  if (first === undefined) return '?'
  const last = words.length > 1 ? words[words.length - 1] : undefined
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const firstLetter = (word: string | undefined) => (word === undefined ? '' : ([...segmenter.segment(word)][0]?.segment.toUpperCase() ?? ''))
  return firstLetter(first) + firstLetter(last)
}
