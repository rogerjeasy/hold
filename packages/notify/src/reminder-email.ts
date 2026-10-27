import type { Email } from './mailer.ts'

// The operations agent's automatic tier (extensions.md section 6.4): fixed templates that move no money, at most one
// of each kind to a renter a day. They name no amount, so nothing in them needs the number guard.

type Language = 'en' | 'de' | 'es' | 'fr'
type Kind = 'return_due' | 'reply_due' | 'invoice'
// When a return or a reply is due; an invoice reminder names no date.
type Facts = { readonly shopName: string; readonly dueOn: string | null }

const isLanguage = (value: string): value is Language => ['en', 'de', 'es', 'fr'].includes(value)

const TEMPLATES: Readonly<Record<Language, Readonly<Record<Kind, { readonly subject: (shop: string) => string; readonly text: (facts: Facts) => string }>>>> = {
  en: {
    return_due: { subject: (shop) => `Your rental from ${shop} is due for return`, text: (facts) => `Your rental from ${facts.shopName} was due back on ${facts.dueOn ?? ''}. Please bring it back, or contact the shop if you need more time.` },
    reply_due: { subject: (shop) => `Please reply to the claim from ${shop}`, text: (facts) => `${facts.shopName} sent you a claim about your rental. Your reply is due by ${facts.dueOn ?? ''}. Open the link the shop sent you to accept it or contest it.` },
    invoice: { subject: (shop) => `Your invoice from ${shop} is still open`, text: (facts) => `The invoice ${facts.shopName} sent you is still unpaid. You can pay it from the email PayPal sent you.` },
  },
  de: {
    return_due: { subject: (shop) => `Rückgabe Ihrer Miete bei ${shop} fällig`, text: (facts) => `Ihre Miete bei ${facts.shopName} war am ${facts.dueOn ?? ''} zurückzugeben. Bitte bringen Sie sie zurück oder melden Sie sich beim Geschäft, wenn Sie mehr Zeit brauchen.` },
    reply_due: { subject: (shop) => `Bitte antworten Sie auf die Forderung von ${shop}`, text: (facts) => `${facts.shopName} hat Ihnen eine Forderung zu Ihrer Miete geschickt. Ihre Antwort ist bis ${facts.dueOn ?? ''} fällig. Öffnen Sie den Link des Geschäfts, um sie anzunehmen oder zu bestreiten.` },
    invoice: { subject: (shop) => `Ihre Rechnung von ${shop} ist noch offen`, text: (facts) => `Die Rechnung, die ${facts.shopName} Ihnen geschickt hat, ist noch nicht bezahlt. Sie können sie über die E-Mail von PayPal bezahlen.` },
  },
  es: {
    return_due: { subject: (shop) => `Toca devolver tu alquiler de ${shop}`, text: (facts) => `Tu alquiler de ${facts.shopName} debía devolverse el ${facts.dueOn ?? ''}. Devuélvelo, o contacta con la tienda si necesitas más tiempo.` },
    reply_due: { subject: (shop) => `Responde a la reclamación de ${shop}`, text: (facts) => `${facts.shopName} te envió una reclamación sobre tu alquiler. Debes responder antes del ${facts.dueOn ?? ''}. Abre el enlace de la tienda para aceptarla o impugnarla.` },
    invoice: { subject: (shop) => `Tu factura de ${shop} sigue pendiente`, text: (facts) => `La factura que ${facts.shopName} te envió sigue sin pagar. Puedes pagarla desde el correo que te envió PayPal.` },
  },
  fr: {
    return_due: { subject: (shop) => `Le retour de votre location chez ${shop} est attendu`, text: (facts) => `Votre location chez ${facts.shopName} devait être rendue le ${facts.dueOn ?? ''}. Merci de la rapporter, ou de contacter le magasin s'il vous faut plus de temps.` },
    reply_due: { subject: (shop) => `Merci de répondre à la réclamation de ${shop}`, text: (facts) => `${facts.shopName} vous a envoyé une réclamation sur votre location. Votre réponse est attendue avant le ${facts.dueOn ?? ''}. Ouvrez le lien du magasin pour l'accepter ou la contester.` },
    invoice: { subject: (shop) => `Votre facture de ${shop} est toujours ouverte`, text: (facts) => `La facture que ${facts.shopName} vous a envoyée n'est pas encore payée. Vous pouvez la régler depuis l'e-mail de PayPal.` },
  },
}

export function reminderEmail(to: string, language: string, kind: Kind, facts: Facts): Email {
  const template = TEMPLATES[isLanguage(language) ? language : 'en'][kind]
  return { to, subject: template.subject(facts.shopName), text: template.text(facts) }
}
