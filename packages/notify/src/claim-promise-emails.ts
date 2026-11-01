import type { Email } from './mailer.ts'

// The shop's promise to decide a contested claim, and the renter's words on a claim (architecture.md section 6.16).
// Neither email quotes the renter or names an amount: the claim page shows both to a signed-in person.

type Language = 'en' | 'de' | 'es' | 'fr'
const isLanguage = (value: string): value is Language => ['en', 'de', 'es', 'fr'].includes(value)

type Facts = { readonly shopName: string; readonly renter: string; readonly claimUrl: string }

type MissedWords = { readonly subject: (renter: string, waived: boolean) => string; readonly text: (facts: Facts, waived: boolean) => string }

const MISSED: Readonly<Record<Language, MissedWords>> = {
  en: {
    subject: (renter, waived) => waived ? `Waived under your rule: ${renter}` : `A promised decision was missed: ${renter}`,
    text: (facts, waived) => waived
      ? `${facts.shopName} promised ${facts.renter} a decision on their contested claim and did not decide in time. Under your standing rule the claim was waived and the hold released. Nothing was charged.\n\n${facts.claimUrl}`
      : `${facts.shopName} promised ${facts.renter} a decision on their contested claim and did not decide in time. The renter has been told. Only the owner can decide it now, with a written reason the renter will read.\n\n${facts.claimUrl}`,
  },
  de: {
    subject: (renter, waived) => waived ? `Nach Ihrer Regel erlassen: ${renter}` : `Zugesagte Entscheidung verpasst: ${renter}`,
    text: (facts, waived) => waived
      ? `${facts.shopName} hat ${facts.renter} eine Entscheidung über die bestrittene Forderung zugesagt und nicht rechtzeitig entschieden. Nach Ihrer Daueranweisung wurde die Forderung erlassen und die Reservierung freigegeben. Nichts wurde belastet.\n\n${facts.claimUrl}`
      : `${facts.shopName} hat ${facts.renter} eine Entscheidung über die bestrittene Forderung zugesagt und nicht rechtzeitig entschieden. Die Mieterin oder der Mieter wurde informiert. Nur die Inhaberin oder der Inhaber kann jetzt entscheiden, mit einer schriftlichen Begründung, die die Mieterin oder der Mieter liest.\n\n${facts.claimUrl}`,
  },
  es: {
    subject: (renter, waived) => waived ? `Anulada según tu regla: ${renter}` : `Decisión prometida no cumplida: ${renter}`,
    text: (facts, waived) => waived
      ? `${facts.shopName} prometió a ${facts.renter} una decisión sobre su reclamación impugnada y no decidió a tiempo. Según tu regla permanente, la reclamación se anuló y la retención se liberó. No se cobró nada.\n\n${facts.claimUrl}`
      : `${facts.shopName} prometió a ${facts.renter} una decisión sobre su reclamación impugnada y no decidió a tiempo. Ya se ha informado a quien alquila. Ahora solo la persona propietaria puede decidir, con un motivo por escrito que quien alquila leerá.\n\n${facts.claimUrl}`,
  },
  fr: {
    subject: (renter, waived) => waived ? `Renoncée selon votre règle : ${renter}` : `Décision promise non tenue : ${renter}`,
    text: (facts, waived) => waived
      ? `${facts.shopName} a promis à ${facts.renter} une décision sur sa réclamation contestée et n’a pas décidé à temps. Selon votre règle permanente, la réclamation a été abandonnée et l’empreinte libérée. Rien n’a été débité.\n\n${facts.claimUrl}`
      : `${facts.shopName} a promis à ${facts.renter} une décision sur sa réclamation contestée et n’a pas décidé à temps. Le locataire a été informé. Seul le propriétaire peut désormais décider, avec un motif écrit que le locataire lira.\n\n${facts.claimUrl}`,
  },
}

const WROTE: Readonly<Record<Language, { readonly subject: (renter: string) => string; readonly text: (facts: Facts) => string }>> = {
  en: { subject: (renter) => `${renter} wrote about their claim`, text: (facts) => `${facts.renter} wrote to ${facts.shopName} about their claim. Read it and answer on the claim page:\n\n${facts.claimUrl}` },
  de: { subject: (renter) => `${renter} hat zur Forderung geschrieben`, text: (facts) => `${facts.renter} hat ${facts.shopName} zur Forderung geschrieben. Lesen und antworten Sie auf der Seite der Forderung:\n\n${facts.claimUrl}` },
  es: { subject: (renter) => `${renter} ha escrito sobre su reclamación`, text: (facts) => `${facts.renter} ha escrito a ${facts.shopName} sobre su reclamación. Léelo y responde en la página de la reclamación:\n\n${facts.claimUrl}` },
  fr: { subject: (renter) => `${renter} a écrit au sujet de sa réclamation`, text: (facts) => `${facts.renter} a écrit à ${facts.shopName} au sujet de sa réclamation. Lisez et répondez sur la page de la réclamation :\n\n${facts.claimUrl}` },
}

export function promiseMissedEmail(to: string, language: string, facts: Facts & { readonly waived: boolean }): Email {
  const words = MISSED[isLanguage(language) ? language : 'en']
  return { to, subject: words.subject(facts.renter, facts.waived), text: words.text(facts, facts.waived) }
}

export function renterWroteEmail(to: string, language: string, facts: Facts): Email {
  const words = WROTE[isLanguage(language) ? language : 'en']
  return { to, subject: words.subject(facts.renter), text: words.text(facts) }
}

const RENTER: Readonly<Record<Language, { readonly subject: (shop: string) => string; readonly text: (shop: string, waived: boolean) => string }>> = {
  en: {
    subject: (shop) => `${shop} did not decide your claim in time`,
    text: (shop, waived) => waived
      ? `${shop} promised to decide your contested claim by a set date and did not. Under the shop's own rule the claim is waived: nothing is charged, and your hold is released.\n\n${shop}`
      : `${shop} promised to decide your contested claim by a set date and did not. The owner has been told and must decide it now, with a written reason you will see on your claim page. Nothing is charged until then.\n\n${shop}`,
  },
  de: {
    subject: (shop) => `${shop} hat Ihre Forderung nicht rechtzeitig entschieden`,
    text: (shop, waived) => waived
      ? `${shop} hat zugesagt, Ihre bestrittene Forderung bis zu einem festen Datum zu entscheiden, und hat es nicht getan. Nach der eigenen Regel des Geschäfts ist die Forderung erlassen: Es wird nichts belastet und Ihre Reservierung wird freigegeben.\n\n${shop}`
      : `${shop} hat zugesagt, Ihre bestrittene Forderung bis zu einem festen Datum zu entscheiden, und hat es nicht getan. Die Inhaberin oder der Inhaber wurde informiert und muss jetzt entscheiden, mit einer schriftlichen Begründung, die Sie auf Ihrer Forderungsseite sehen. Bis dahin wird nichts belastet.\n\n${shop}`,
  },
  es: {
    subject: (shop) => `${shop} no decidió tu reclamación a tiempo`,
    text: (shop, waived) => waived
      ? `${shop} prometió decidir tu reclamación impugnada antes de una fecha y no lo hizo. Según la propia regla de la tienda, la reclamación queda anulada: no se cobra nada y tu retención se libera.\n\n${shop}`
      : `${shop} prometió decidir tu reclamación impugnada antes de una fecha y no lo hizo. Se ha informado a la persona propietaria, que debe decidir ahora con un motivo por escrito que verás en la página de tu reclamación. Hasta entonces no se cobra nada.\n\n${shop}`,
  },
  fr: {
    subject: (shop) => `${shop} n’a pas décidé de votre réclamation à temps`,
    text: (shop, waived) => waived
      ? `${shop} a promis de décider de votre réclamation contestée avant une date fixée et ne l’a pas fait. Selon la règle de la boutique, la réclamation est abandonnée : rien n’est débité et votre empreinte est libérée.\n\n${shop}`
      : `${shop} a promis de décider de votre réclamation contestée avant une date fixée et ne l’a pas fait. Le propriétaire a été informé et doit décider maintenant, avec un motif écrit que vous verrez sur la page de votre réclamation. Rien n’est débité d’ici là.\n\n${shop}`,
  },
}

export function promiseMissedRenterEmail(to: string, language: string, facts: { readonly shopName: string; readonly waived: boolean }): Email {
  const words = RENTER[isLanguage(language) ? language : 'en']
  return { to, subject: words.subject(facts.shopName), text: words.text(facts.shopName, facts.waived) }
}

// The same news as a text, for a renter who chose texts (architecture.md section 12.3).
const RENTER_TEXT: Readonly<Record<Language, (shop: string, waived: boolean) => string>> = {
  en: (shop, waived) => waived
    ? `${shop} did not decide your contested claim by the date it promised, so the claim is waived: nothing is charged, and your hold is released.`
    : `${shop} did not decide your contested claim by the date it promised. The owner must decide it now, with a written reason on your claim page. Nothing is charged until then.`,
  de: (shop, waived) => waived
    ? `${shop} hat Ihre bestrittene Forderung nicht bis zum zugesagten Datum entschieden. Die Forderung ist erlassen: Es wird nichts belastet und Ihre Reservierung wird freigegeben.`
    : `${shop} hat Ihre bestrittene Forderung nicht bis zum zugesagten Datum entschieden. Die Inhaberin oder der Inhaber muss jetzt entscheiden, mit einer schriftlichen Begründung auf Ihrer Forderungsseite. Bis dahin wird nichts belastet.`,
  es: (shop, waived) => waived
    ? `${shop} no decidió tu reclamación impugnada antes de la fecha prometida, así que queda anulada: no se cobra nada y tu retención se libera.`
    : `${shop} no decidió tu reclamación impugnada antes de la fecha prometida. La persona propietaria debe decidirla ahora, con un motivo por escrito en la página de tu reclamación. Hasta entonces no se cobra nada.`,
  fr: (shop, waived) => waived
    ? `${shop} n'a pas décidé de votre réclamation contestée avant la date promise : elle est abandonnée, rien n'est débité et votre empreinte est libérée.`
    : `${shop} n'a pas décidé de votre réclamation contestée avant la date promise. Le propriétaire doit décider maintenant, avec un motif écrit sur la page de votre réclamation. Rien n'est débité d'ici là.`,
}

export function promiseMissedRenterText(language: string, facts: { readonly shopName: string; readonly waived: boolean }): string {
  return RENTER_TEXT[isLanguage(language) ? language : 'en'](facts.shopName, facts.waived)
}
