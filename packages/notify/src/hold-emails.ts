import { formatMoney } from '@hold/domain'
import type { Money } from '@hold/domain'
import type { Email } from './mailer.ts'

// What the worker tells people about a hold, in their own language. The words for a hold match the web app's:
// Reservierung, retención, empreinte.

type Language = 'en' | 'de' | 'es' | 'fr'

const isLanguage = (value: string): value is Language => ['en', 'de', 'es', 'fr'].includes(value)

type ExpiredFacts = { readonly shopName: string; readonly renter: string; readonly amount: Money; readonly rentalUrl: string }

const EXPIRED: Readonly<Record<Language, { readonly subject: (renter: string) => string; readonly text: (facts: ExpiredFacts, amount: string) => string }>> = {
  en: {
    subject: (renter) => `A hold expired: ${renter}`,
    text: (facts, amount) =>
      `The hold of ${amount} for ${facts.renter} at ${facts.shopName} reached the end of its 29 days, and nothing replaced it. PayPal no longer reserves the money. Any claim on this rental now goes to the renter as an invoice.\n\nSee the rental: ${facts.rentalUrl}`,
  },
  de: {
    subject: (renter) => `Eine Reservierung ist abgelaufen: ${renter}`,
    text: (facts, amount) =>
      `Die Reservierung über ${amount} für ${facts.renter} bei ${facts.shopName} hat das Ende ihrer 29 Tage erreicht, ohne ersetzt zu werden. PayPal reserviert das Geld nicht mehr. Eine Forderung zu dieser Miete geht jetzt als Rechnung an die mietende Person.\n\nZur Miete: ${facts.rentalUrl}`,
  },
  es: {
    subject: (renter) => `Una retención ha caducado: ${renter}`,
    text: (facts, amount) =>
      `La retención de ${amount} de ${facts.renter} en ${facts.shopName} llegó al final de sus 29 días sin que nada la sustituyera. PayPal ya no reserva el dinero. Cualquier reclamación de este alquiler se envía ahora como factura a quien alquila.\n\nVer el alquiler: ${facts.rentalUrl}`,
  },
  fr: {
    subject: (renter) => `Une empreinte a expiré : ${renter}`,
    text: (facts, amount) =>
      `L'empreinte de ${amount} pour ${facts.renter} chez ${facts.shopName} est arrivée au bout de ses 29 jours sans être remplacée. PayPal ne réserve plus l'argent. Toute réclamation sur cette location est désormais envoyée en facture à la personne qui loue.\n\nVoir la location : ${facts.rentalUrl}`,
  },
}

// What PayPal shows a renter approving a hold (at most 127 characters), from the web app at pickup and from the worker
// for a replacement.
const ORDER_DESCRIPTION: Readonly<Record<Language, (shopName: string) => string>> = {
  en: (shop) => `Refundable hold for your rental at ${shop}. Not a charge.`,
  de: (shop) => `Rückzahlbare Reservierung für Ihre Miete bei ${shop}. Keine Abbuchung.`,
  es: (shop) => `Retención reembolsable de tu alquiler en ${shop}. No es un cobro.`,
  fr: (shop) => `Empreinte remboursable pour votre location chez ${shop}. Pas un prélèvement.`,
}

export function holdOrderDescription(language: string, shopName: string): string {
  return ORDER_DESCRIPTION[isLanguage(language) ? language : 'en'](shopName).slice(0, 127)
}

// A walk-in's one order, for the fee and the hold together (architecture.md section 8.2). PayPal takes 127 characters.
const WALK_IN_ORDER_DESCRIPTION: Readonly<Record<Language, (shopName: string) => string>> = {
  en: (shop) => `Rental fee and refundable hold at ${shop}. Only the fee is charged.`,
  de: (shop) => `Mietgebühr und rückzahlbare Reservierung bei ${shop}. Abgebucht wird nur die Gebühr.`,
  es: (shop) => `Tarifa de alquiler y retención reembolsable en ${shop}. Solo se cobra la tarifa.`,
  fr: (shop) => `Frais de location et empreinte remboursable chez ${shop}. Seuls les frais sont prélevés.`,
}

export function walkInOrderDescription(language: string, shopName: string): string {
  return WALK_IN_ORDER_DESCRIPTION[isLanguage(language) ? language : 'en'](shopName).slice(0, 127)
}

type ReplacementFacts = { readonly shopName: string; readonly amount: Money; readonly approveUrl: string; readonly endsOn: string }

const REPLACEMENT: Readonly<Record<Language, { readonly subject: (shop: string) => string; readonly text: (facts: ReplacementFacts, amount: string) => string }>> = {
  en: {
    subject: (shop) => `Please approve a new hold for your rental at ${shop}`,
    text: (facts, amount) =>
      `The hold of ${amount} on your rental at ${facts.shopName} ends on ${facts.endsOn}, and your rental is still open. PayPal holds can last only 29 days, so the shop asks you to approve a new hold of the same amount. It is not a charge. Once you approve it, the old hold is released.\n\nApprove the new hold: ${facts.approveUrl}`,
  },
  de: {
    subject: (shop) => `Bitte genehmigen Sie eine neue Reservierung für Ihre Miete bei ${shop}`,
    text: (facts, amount) =>
      `Die Reservierung über ${amount} für Ihre Miete bei ${facts.shopName} endet am ${facts.endsOn}, und Ihre Miete ist noch offen. PayPal-Reservierungen gelten höchstens 29 Tage, daher bittet der Laden Sie, eine neue Reservierung über denselben Betrag zu genehmigen. Das ist keine Abbuchung. Sobald Sie sie genehmigen, wird die alte Reservierung freigegeben.\n\nNeue Reservierung genehmigen: ${facts.approveUrl}`,
  },
  es: {
    subject: (shop) => `Aprueba una nueva retención para tu alquiler en ${shop}`,
    text: (facts, amount) =>
      `La retención de ${amount} de tu alquiler en ${facts.shopName} termina el ${facts.endsOn}, y tu alquiler sigue abierto. Las retenciones de PayPal duran como máximo 29 días, así que la tienda te pide aprobar una nueva retención por el mismo importe. No es un cobro. En cuanto la apruebes, se libera la anterior.\n\nAprobar la nueva retención: ${facts.approveUrl}`,
  },
  fr: {
    subject: (shop) => `Veuillez approuver une nouvelle empreinte pour votre location chez ${shop}`,
    text: (facts, amount) =>
      `L'empreinte de ${amount} sur votre location chez ${facts.shopName} prend fin le ${facts.endsOn}, et votre location est toujours en cours. Une empreinte PayPal dure au plus 29 jours : la boutique vous demande donc d'approuver une nouvelle empreinte du même montant. Ce n'est pas un prélèvement. Dès que vous l'approuvez, l'ancienne est libérée.\n\nApprouver la nouvelle empreinte : ${facts.approveUrl}`,
  },
}

// Asks a renter to approve a new hold before the old one ends (architecture.md section 7.4).
export function holdReplacementEmail(to: string, language: string, facts: ReplacementFacts): Email {
  const chosen = isLanguage(language) ? language : 'en'
  const words = REPLACEMENT[chosen]
  return { to, subject: words.subject(facts.shopName), text: words.text(facts, formatMoney(facts.amount, chosen)) }
}

// Tells an owner that a hold expired with nothing replacing it (architecture.md section 7.4).
export function holdExpiredEmail(to: string, language: string, facts: ExpiredFacts): Email {
  const chosen = isLanguage(language) ? language : 'en'
  const words = EXPIRED[chosen]
  return { to, subject: words.subject(facts.renter), text: words.text(facts, formatMoney(facts.amount, chosen)) }
}
