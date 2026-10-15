// A plain key from words a person wrote: "Déchirure de la selle" becomes "dechirure-de-la-selle". Empty when the
// words hold no letter or digit.
export function slugOf(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}
