import { decimalsOf } from './currency.ts'
import type { Money } from './money.ts'

// The number guard (architecture.md section 10.4). A message a model wrote for a renter is kept only if every number
// in it is one of the amounts plain code read from the database. Otherwise it is dropped and the caller uses a fixed
// template. A renter never reads an amount, a count or a time that the record does not hold.

// Digits, with the separators people put inside a number: "35", "35.00", "35,00", "1'200.50", and spaces.
const NUMBER = /\d+(?:[.,'\u2019 \u00a0\u202f]\d+)*/g
const SEPARATOR = /[.,'\u2019 \u00a0\u202f]/

// A number as an amount in the currency's smallest unit, read by the currency's rules: a decimal part has exactly the
// currency's decimal digits after a point or a comma; thousands groups have exactly three digits; a number with no
// decimal part counts whole units, so "3500" is never 35.00. Undefined for anything written otherwise.
function readAmount(text: string, currency: string): number | undefined {
  const decimals = decimalsOf(currency)
  const parts = text.split(SEPARATOR)
  const separators = text.replace(/\d/g, '').split('')
  let fraction = 0
  const last = parts.at(-1) ?? ''
  const lastSeparator = separators.at(-1)
  if (decimals > 0 && parts.length > 1 && (lastSeparator === '.' || lastSeparator === ',') && last.length === decimals) {
    // The decimal separator is not also a thousands separator: "1,200,50" is no amount.
    if (separators.slice(0, -1).includes(lastSeparator)) return undefined
    fraction = Number(last)
    parts.pop()
  }
  const [first = '', ...groups] = parts
  if (first.length > 1 && first.startsWith('0')) return undefined
  if (groups.length > 0 && (first.length > 3 || groups.some((group) => group.length !== 3))) return undefined
  return Number(parts.join('')) * 10 ** decimals + fraction
}

// Any digit, numeral or number sign of a script other than ASCII: Arabic-Indic, Devanagari, full-width, superscripts,
// circled and Roman numerals. None may stand for an amount, so none may appear at all.
const OTHER_DIGITS = /[^\P{N}0-9]/u
// A share of anything: percent, per mille and their full-width and small forms.
const SHARE_SIGNS = /[%％﹪‰‱٪]/u

// Number words in English, French, Spanish and German, lower case and without accents. The French, Spanish and German
// word for one is also the indefinite article (un, une, uno, una, ein, eine), so it is left out: dropping it would drop
// nearly every sentence, while a limit of exactly one unit is the only thing it could carry.
const NUMBER_WORDS = new Set([
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'hundreds', 'thousand', 'thousands', 'million', 'millions', 'dozen', 'percent', 'half', 'quarter',
  'deux', 'trois', 'quatre', 'cinq', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'vingt', 'vingts', 'trente', 'quarante', 'cinquante', 'soixante', 'septante', 'huitante', 'octante', 'nonante', 'cent', 'cents', 'mille', 'milliers', 'pourcent', 'moitie', 'quart',
  'cero', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa', 'cien', 'ciento', 'mil', 'millon', 'millones', 'mitad',
  'null', 'eins', 'zwei', 'drei', 'vier', 'funf', 'fuenf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwolf', 'zwoelf', 'zwanzig', 'dreissig', 'hundert', 'tausend', 'millionen', 'prozent', 'halfte', 'haelfte', 'viertel',
])
// Parts that only number words are built from: German and Spanish write whole numbers as one word, as in
// fünfundzwanzig, dreihundert, veintitrés and trescientos.
const NUMBER_PARTS = ['hundred', 'thousand', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'teen', 'vingt', 'hundert', 'tausend', 'zehn', 'zig', 'ssig', 'veinti', 'cientos', 'cientas', 'ciento', 'prozent', 'percent']

function hasNumberWord(text: string): boolean {
  const plain = text.normalize('NFD').replace(/\p{M}/gu, '').replace(/ß/g, 'ss').toLowerCase()
  return (plain.match(/\p{L}+/gu) ?? []).some((word) => NUMBER_WORDS.has(word) || NUMBER_PARTS.some((part) => word.includes(part)))
}

// Every way an amount could be written in digits: its cents, and its units with a point or a comma.
function digitWritings(amount: Money): string[] {
  const decimals = decimalsOf(amount.currency)
  const units = String(Math.floor(amount.cents / 10 ** decimals))
  const fraction = decimals === 0 ? '' : String(amount.cents % 10 ** decimals).padStart(decimals, '0')
  return decimals === 0 ? [units] : [String(amount.cents), `${units}.${fraction}`, `${units},${fraction}`, units]
}

// What one side must never write, even as an amount the move allows: its own limits (extensions.md section 9.13).
export type ForbiddenNumbers = { readonly amounts?: readonly Money[]; readonly wholeNumbers?: readonly number[] }

export function guardNumbers(text: string, allowed: readonly Money[], forbidden: ForbiddenNumbers = {}): string | null {
  if (OTHER_DIGITS.test(text) || SHARE_SIGNS.test(text) || hasNumberWord(text)) return null
  const found = text.match(NUMBER) ?? []
  if ((forbidden.amounts ?? []).some((amount) => digitWritings(amount).some((written) => found.some((number) => number === written || number.split(SEPARATOR)[0] === written)))) return null
  if ((forbidden.wholeNumbers ?? []).some((whole) => found.some((number) => number.split(SEPARATOR)[0] === String(whole)))) return null
  return found.every((number) => allowed.some((amount) => readAmount(number, amount.currency) === amount.cents)) ? text : null
}
