import { formatMoney } from '@hold/domain'
import type { Money } from '@hold/domain'
import type { Email } from './mailer.ts'

type Language = 'en' | 'fr' | 'de' | 'es'
type SettlementKind = 'capture' | 'release' | 'refund' | 'invoice_sent' | 'invoice_paid'
type SettlementDetails = {
  readonly shopName: string
  readonly rentalReference: string
  readonly version: number
  readonly recordUrl: string
  readonly simulated: boolean
  readonly kind: SettlementKind
  readonly amount: Money
  readonly releasedCents: number
  readonly final: boolean
}

type Words = {
  readonly events: Readonly<Record<SettlementKind, string>>
  readonly unpaid: string
  readonly reference: string
  readonly version: string
  readonly released: string
  readonly link: string
  readonly final: string
  readonly pending: string
  readonly simulated: string
}

const WORDS: Readonly<Record<Language, Words>> = {
  en: {
    events: { capture: 'Payment received', release: 'Hold released', refund: 'Refund confirmed', invoice_sent: 'Payment requested', invoice_paid: 'Invoice paid' },
    unpaid: 'This is a payment request, not a payment receipt.',
    reference: 'Rental reference', version: 'Record version', released: 'Total hold released', link: 'View your secure record',
    final: 'Settlement is complete.', pending: 'This confirms this event only. Review or settlement is still open.', simulated: 'Simulated demo',
  },
  fr: {
    events: { capture: 'Paiement reçu', release: 'Empreinte libérée', refund: 'Remboursement confirmé', invoice_sent: 'Paiement demandé', invoice_paid: 'Facture payée' },
    unpaid: 'Il s’agit d’une demande de paiement, pas d’un reçu de paiement.',
    reference: 'Référence de location', version: 'Version du dossier', released: 'Total de l’empreinte libérée', link: 'Consulter votre dossier sécurisé',
    final: 'Le règlement est terminé.', pending: 'Ce message confirme uniquement cet événement. L’examen ou le règlement est encore en cours.', simulated: 'Démonstration simulée',
  },
  de: {
    events: { capture: 'Zahlung erhalten', release: 'Reservierung freigegeben', refund: 'Erstattung bestätigt', invoice_sent: 'Zahlung angefordert', invoice_paid: 'Rechnung bezahlt' },
    unpaid: 'Dies ist eine Zahlungsaufforderung, keine Zahlungsbestätigung.',
    reference: 'Mietreferenz', version: 'Version der Unterlagen', released: 'Insgesamt freigegebene Reservierung', link: 'Ihre geschützten Unterlagen ansehen',
    final: 'Die Abrechnung ist abgeschlossen.', pending: 'Diese Nachricht bestätigt nur dieses Ereignis. Die Prüfung oder Abrechnung ist noch offen.', simulated: 'Simulierte Demo',
  },
  es: {
    events: { capture: 'Pago recibido', release: 'Retención liberada', refund: 'Reembolso confirmado', invoice_sent: 'Pago solicitado', invoice_paid: 'Factura pagada' },
    unpaid: 'Esto es una solicitud de pago, no un recibo de pago.',
    reference: 'Referencia del alquiler', version: 'Versión del expediente', released: 'Total de la retención liberada', link: 'Ver tu expediente seguro',
    final: 'La liquidación ha finalizado.', pending: 'Este mensaje confirma solo este evento. La revisión o liquidación sigue abierta.', simulated: 'Demostración simulada',
  },
}

export function settlementReceiptEmail(to: string, language: string, details: SettlementDetails): Email {
  const chosen = language === 'fr' || language === 'de' || language === 'es' ? language : 'en'
  const words = WORDS[chosen]
  const event = words.events[details.kind]
  const simulated = details.simulated ? `[${words.simulated}] ` : ''
  const lines = [
    `${simulated}${details.shopName}`,
    `${words.reference}: ${details.rentalReference}`,
    `${words.version}: ${String(details.version)}`,
    '',
    `${event}: ${formatMoney(details.amount, chosen)}`,
  ]
  if (details.kind === 'capture' || details.kind === 'release') lines.push(`${words.released}: ${formatMoney({ cents: details.releasedCents, currency: details.amount.currency }, chosen)}`)
  if (details.kind === 'invoice_sent') lines.push(words.unpaid)
  lines.push('', details.final ? words.final : words.pending, '', `${words.link}: ${details.recordUrl}`)
  return { to, subject: `${simulated}${event}: ${details.shopName}`, text: lines.join('\n') }
}

// The same confirmation as a text, for a renter who chose texts (architecture.md section 12.3). The email still goes to
// the address PayPal gave, so both channels hear of every amount PayPal moved.
export function settlementReceiptText(language: string, details: Pick<SettlementDetails, 'shopName' | 'kind' | 'amount' | 'simulated' | 'recordUrl'>): string {
  const chosen = language === 'fr' || language === 'de' || language === 'es' ? language : 'en'
  const words = WORDS[chosen]
  const simulated = details.simulated ? `[${words.simulated}] ` : ''
  return `${simulated}${details.shopName}: ${words.events[details.kind]}: ${formatMoney(details.amount, chosen)}. ${words.link}: ${details.recordUrl}`
}
