// Detect with code, explain with the model (AGENTS.md section 8). Anything in a renter's report that could bear on
// someone's safety goes to a person with a fixed message, whatever a model would say (extensions.md section 10.3).
// A word list, not a judgement: a false alarm costs a phone call, a missed injury costs far more, so the words are
// broad. They are matched as parts of words, read without capitals or accents, so "gestürzt" and "GESTURZT" match
// alike and German compounds such as "Rahmenbruch" are caught.

const WORDS: Readonly<Record<'en' | 'fr' | 'es' | 'de', readonly string[]>> = {
  en: [
    'hurt', 'injur', 'wound', 'bleed', 'blood', 'ambulance', 'hospital', 'emergency', 'accident', 'crash', 'collid', 'collision', 'hit by', 'knocked',
    'fell', 'fall off', 'fallen', 'unconscious', 'concuss', 'fractur', 'crack', 'snapped', 'broke', 'bent', 'brake', 'steering', 'loose wheel', 'wheel came off',
    'fire', 'flame', 'burn', 'smok', 'spark', 'overheat', 'swollen', 'swell', 'explo', 'leak', 'acid', 'shock', 'danger', 'unsafe', 'not safe',
  ],
  fr: [
    'bless', 'saign', 'du sang', 'hopital', 'urgence', 'ambulance', 'accident', 'choc', 'chute', 'tombe', 'fissur', 'fele', 'casse', 'frein', 'guidon',
    'feu', 'flamme', 'brul', 'fume', 'etincel', 'surchauff', 'batterie gonfl', 'explos', 'fuite', 'danger', 'pas sur',
  ],
  es: [
    'herid', 'lesion', 'sangr', 'hospital', 'ambulancia', 'urgencia', 'emergencia', 'accidente', 'choque', 'caida', 'me cai', 'se cayo', 'fractur', 'grieta',
    'agriet', 'roto', 'rota', 'freno', 'manillar', 'fuego', 'quem', 'humo', 'chispa', 'sobrecalent', 'hinchad', 'explot', 'fuga', 'descarga', 'peligro', 'insegur',
  ],
  de: [
    'verletz', 'wunde', 'blut', 'krankenhaus', 'notarzt', 'rettungswagen', 'notfall', 'unfall', 'sturz', 'gesturzt', 'hingefallen', 'bruch', 'gebrochen',
    'riss', 'gerissen', 'bremse', 'lenker', 'feuer', 'flamme', 'brennt', 'verbrannt', 'rauch', 'funke', 'uberhitz', 'aufgeblaht', 'explod', 'ausgelaufen',
    'stromschlag', 'gefahr', 'unsicher',
  ],
}

const ALL_WORDS = Object.values(WORDS).flat()

// Lower case, with accents and umlauts reduced to their plain letter.
const plain = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export function mentionsSafety(description: string): boolean {
  const text = plain(description)
  return ALL_WORDS.some((word) => text.includes(word))
}
