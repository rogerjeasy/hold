import { describe, expect, it } from 'vitest'
import { settlementReceiptEmail } from './index.ts'

const details = {
  shopName: 'Ribeira Bikes', rentalReference: 'R-2026-18', version: 3,
  recordUrl: 'https://hold.test/r/signed-record/record', simulated: false,
  kind: 'capture' as const, amount: { cents: 12345, currency: 'EUR' }, releasedCents: 7655, final: true,
}

const languages = [
  { language: 'en', capture: 'Payment received', release: 'Hold released', refund: 'Refund confirmed', requested: 'Payment requested', paid: 'Invoice paid', unpaid: 'This is a payment request, not a payment receipt.', amount: '€123.45', released: '€76.55', reference: 'Rental reference', version: 'Record version', link: 'View your secure record', final: 'Settlement is complete.', pending: 'This confirms this event only. Review or settlement is still open.', simulated: 'Simulated demo' },
  { language: 'fr', capture: 'Paiement reçu', release: 'Empreinte libérée', refund: 'Remboursement confirmé', requested: 'Paiement demandé', paid: 'Facture payée', unpaid: "Il s’agit d’une demande de paiement, pas d’un reçu de paiement.", amount: '123,45', released: '76,55', reference: 'Référence de location', version: 'Version du dossier', link: 'Consulter votre dossier sécurisé', final: 'Le règlement est terminé.', pending: 'Ce message confirme uniquement cet événement. L’examen ou le règlement est encore en cours.', simulated: 'Démonstration simulée' },
  { language: 'de', capture: 'Zahlung erhalten', release: 'Reservierung freigegeben', refund: 'Erstattung bestätigt', requested: 'Zahlung angefordert', paid: 'Rechnung bezahlt', unpaid: 'Dies ist eine Zahlungsaufforderung, keine Zahlungsbestätigung.', amount: '123,45', released: '76,55', reference: 'Mietreferenz', version: 'Version der Unterlagen', link: 'Ihre geschützten Unterlagen ansehen', final: 'Die Abrechnung ist abgeschlossen.', pending: 'Diese Nachricht bestätigt nur dieses Ereignis. Die Prüfung oder Abrechnung ist noch offen.', simulated: 'Simulierte Demo' },
  { language: 'es', capture: 'Pago recibido', release: 'Retención liberada', refund: 'Reembolso confirmado', requested: 'Pago solicitado', paid: 'Factura pagada', unpaid: 'Esto es una solicitud de pago, no un recibo de pago.', amount: '123,45', released: '76,55', reference: 'Referencia del alquiler', version: 'Versión del expediente', link: 'Ver tu expediente seguro', final: 'La liquidación ha finalizado.', pending: 'Este mensaje confirma solo este evento. La revisión o liquidación sigue abierta.', simulated: 'Demostración simulada' },
]

describe('settlement receipt email', () => {
  it('does not invent a hold release in a refund or invoice notice', () => {
    for (const kind of ['refund', 'invoice_sent', 'invoice_paid'] as const) {
      const email = settlementReceiptEmail('renter@example.test', 'en', { ...details, kind, releasedCents: 0 })
      expect(email.text).not.toContain('Total hold released')
    }
  })
  it.each(languages)('renders a localized receipt with the versioned record in $language', (words) => {
    const email = settlementReceiptEmail('renter@example.test', words.language, details)
    expect(email.to).toBe('renter@example.test')
    expect(email.subject).toContain(words.capture)
    expect(email.subject).toContain('Ribeira Bikes')
    for (const value of [words.capture, words.amount, words.released, `${words.reference}: R-2026-18`, `${words.version}: 3`, words.link, details.recordUrl, words.final]) {
      expect(email.text).toContain(value)
    }
    expect(email.text).not.toContain(words.pending)
    expect(email.text).not.toContain(words.simulated)
  })

  it.each(languages)('distinguishes an invoice request from received payment in $language', (words) => {
    const requested = settlementReceiptEmail('renter@example.test', words.language, { ...details, kind: 'invoice_sent', final: false })
    const paid = settlementReceiptEmail('renter@example.test', words.language, { ...details, kind: 'invoice_paid' })
    expect(requested.subject).toContain(words.requested)
    expect(requested.text).toContain(words.unpaid)
    expect(requested.text).not.toContain(words.paid)
    expect(paid.subject).toContain(words.paid)
    expect(paid.text).toContain(words.paid)
    expect(paid.text).not.toContain(words.unpaid)
  })

  it.each(languages)('labels releases and refunds for people in $language', (words) => {
    const release = settlementReceiptEmail('renter@example.test', words.language, { ...details, kind: 'release' })
    const refund = settlementReceiptEmail('renter@example.test', words.language, { ...details, kind: 'refund' })
    expect(release.subject).toContain(words.release)
    expect(release.text).toContain(words.release)
    expect(refund.subject).toContain(words.refund)
    expect(refund.text).toContain(words.refund)
  })

  it.each(languages)('does not close a pending review or settlement in $language', (words) => {
    const email = settlementReceiptEmail('renter@example.test', words.language, { ...details, final: false })
    expect(email.text).toContain(words.pending)
    expect(email.text).not.toContain(words.final)
  })

  it.each(languages)('marks simulated events in the subject and record message in $language', (words) => {
    const email = settlementReceiptEmail('renter@example.test', words.language, { ...details, simulated: true })
    expect(email.subject).toContain(words.simulated)
    expect(email.text).toContain(words.simulated)
  })

  it('falls back to English when the recipient language is unsupported', () => {
    expect(settlementReceiptEmail('renter@example.test', 'pt', details).text).toContain('Payment received: €123.45')
  })
})
