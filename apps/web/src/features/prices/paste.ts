import { parseAmount } from '@hold/domain'
import type { PriceCategory } from '@hold/domain'

// A shop's existing price list, pasted from a spreadsheet, a document or an email, read into rows of the draft. Each
// row then goes through the same checks as one typed by hand; nothing here decides a price is valid.

export type PastedRow = { readonly description: string; readonly category: PriceCategory; readonly amount: string }

// The kinds of price as people name them in a list, in English. The editor adds the names in the shop's language.
const KIND_WORDS: Readonly<Record<string, PriceCategory>> = { damage: 'damage', damaged: 'damage', loss: 'loss', lost: 'loss', lateness: 'lateness', late: 'lateness', cleaning: 'cleaning', clean: 'cleaning' }

// An amount as people write it: "€35", "35 EUR", "1.234,50", "CHF 1’200.50". Signs, codes and spaces go; of two
// separators the last is the decimal one; a lone separator before exactly three digits groups thousands.
export function cleanAmount(text: string): string {
  const bare = text.replace(/[A-Z]{3}|[€$£¥\s\u00a0\u202f’']/g, '')
  const dot = bare.lastIndexOf('.')
  const comma = bare.lastIndexOf(',')
  if (dot !== -1 && comma !== -1) {
    const decimal = dot > comma ? '.' : ','
    const grouping = decimal === '.' ? ',' : '.'
    return bare.replaceAll(grouping, '').replace(decimal, '.')
  }
  const separator = dot !== -1 ? '.' : comma !== -1 ? ',' : undefined
  if (separator === undefined) return bare
  const parts = bare.split(separator)
  const grouping = parts.length > 2 || (parts.length === 2 && parts[1]?.length === 3)
  return grouping ? parts.join('') : parts.join('.')
}

const TRAILING_AMOUNT = /^(.*?\S)[\s,:;–-]+([€$£]?\s*\d[\d.,’'\s]*\s*(?:€|\$|£|[A-Z]{3})?)$/

function cellsOf(line: string, currency: string): string[] {
  if (line.includes('\t')) return line.split('\t')
  if (line.includes(';')) return line.split(';')
  const trailing = TRAILING_AMOUNT.exec(line.trim())
  if (trailing?.[1] !== undefined && trailing[2] !== undefined && parseAmount(cleanAmount(trailing[2]), currency) !== undefined) return [trailing[1], trailing[2]]
  return [line]
}

type ReadLine = { readonly description: string; readonly category: PriceCategory | undefined; readonly amount: string | undefined; readonly unread: string | undefined }

function readLine(line: string, currency: string, kinds: Readonly<Record<string, PriceCategory>>): ReadLine | undefined {
  const cells = cellsOf(line, currency).map((cell) => cell.trim())
  const amountAt = cells.findLastIndex((cell) => cell !== '' && parseAmount(cleanAmount(cell), currency) !== undefined)
  const kindAt = cells.findIndex((cell, index) => index !== amountAt && kinds[cell.toLowerCase()] !== undefined)
  const description = cells.find((cell, index) => index !== amountAt && index !== kindAt && cell !== '') ?? ''
  if (description === '' && amountAt === -1) return undefined
  const kind = kindAt === -1 ? undefined : kinds[cells[kindAt]?.toLowerCase() ?? '']
  if (amountAt !== -1) return { description, category: kind, amount: cleanAmount(cells[amountAt] ?? ''), unread: undefined }
  // No price it can read: what was written where the price would be stays, for the shop to see and fix.
  const descriptionAt = cells.indexOf(description)
  const unread = cells.findLast((cell, index) => index !== descriptionAt && index !== kindAt && cell !== '')
  return { description, category: kind, amount: undefined, unread }
}

const kindWords = (localKinds: Readonly<Record<string, PriceCategory>>) => ({ ...KIND_WORDS, ...Object.fromEntries(Object.entries(localKinds).map(([word, kind]) => [word.toLowerCase(), kind])) })

// A kind as written, in English or the shop's language, or none when the word is not one.
export function readKind(word: string, localKinds: Readonly<Record<string, PriceCategory>> = {}): PriceCategory | undefined {
  return kindWords(localKinds)[word.trim().toLowerCase()]
}

// An amount as written, cleaned when that makes it money in the currency, and otherwise kept as written for the shop
// to see and fix.
export function readAmount(text: string, currency: string): string {
  const cleaned = cleanAmount(text)
  return parseAmount(cleaned, currency) === undefined ? text.trim() : cleaned
}

// A pasted row whose kind is left unset when the line names none, so a paste over an existing row can keep its kind.
export type ReadRow = { readonly description: string; readonly category: PriceCategory | undefined; readonly amount: string }

// Rows in the order pasted. A first line with no amount, above lines that have one, is a header and is skipped. A
// line with words but no amount it can read is kept with the amount empty, for the shop to fill in.
export function readPastedLines(text: string, currency: string, localKinds: Readonly<Record<string, PriceCategory>> = {}): { readonly rows: ReadRow[]; readonly skipped: number } {
  const kinds = kindWords(localKinds)
  const lines = text.split(/\r?\n/).map((line) => readLine(line, currency, kinds)).filter((line): line is ReadLine => line !== undefined)
  const header = lines.length > 1 && lines[0]?.amount === undefined && lines.slice(1).some((line) => line.amount !== undefined)
  const rows = (header ? lines.slice(1) : lines).map((line) => ({ description: line.description, category: line.category, amount: line.amount ?? line.unread ?? '' }))
  return { rows, skipped: header ? 1 : 0 }
}

// The same, each row a kind: one the line names, or damage.
export function parsePastedPrices(text: string, currency: string, localKinds: Readonly<Record<string, PriceCategory>> = {}): { readonly rows: PastedRow[]; readonly skipped: number } {
  const read = readPastedLines(text, currency, localKinds)
  return { rows: read.rows.map((row) => ({ ...row, category: row.category ?? 'damage' })), skipped: read.skipped }
}
