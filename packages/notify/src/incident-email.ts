import type { IncidentKind } from '@hold/domain'
import type { Email } from './mailer.ts'

// What staff are told the moment a renter reports something during a rental (extensions.md section 10). The renter's
// own words stay on the incidents page: an email never quotes them, and never names an amount.

type Language = 'en' | 'de' | 'es' | 'fr'
type Kind = IncidentKind | 'unsorted'

const isLanguage = (value: string): value is Language => ['en', 'de', 'es', 'fr'].includes(value)

type AlertFacts = { readonly shopName: string; readonly itemLabel: string; readonly kind: IncidentKind | null; readonly incidentsUrl: string }

const WORDS: Readonly<Record<Language, { readonly subject: (item: string) => string; readonly kinds: Readonly<Record<Kind, string>>; readonly text: (facts: AlertFacts, kind: string) => string }>> = {
  en: {
    subject: (item) => `A renter reported something: ${item}`,
    kinds: {
      small_damage: 'Small damage. Confirm which published price applies, so the renter can agree to it.',
      mechanical_fault: 'A fault. Decide whether to swap, collect or compensate, and make it the shop’s matter.',
      theft_or_loss: 'A theft or loss. The renter was given the fixed steps.',
      unsafe_or_unclear: 'Something that could bear on safety, or that could not be sorted. The renter was told to stop using the item and that the shop will contact them.',
      unsorted: 'A report not yet sorted. The renter was told the shop will contact them.',
    },
    text: (facts, kind) => `A renter of ${facts.itemLabel} at ${facts.shopName} reported something during the rental.\n\n${kind}\n\nA person needs to look at it: ${facts.incidentsUrl}`,
  },
  fr: {
    subject: (item) => `Un locataire a signalé un problème : ${item}`,
    kinds: {
      small_damage: 'Un petit dommage. Confirmez le prix publié qui s’applique, pour que le locataire puisse l’accepter.',
      mechanical_fault: 'Une panne. Décidez d’échanger, de récupérer ou de dédommager, et prenez-la en charge au nom de la boutique.',
      theft_or_loss: 'Un vol ou une perte. Le locataire a reçu les étapes à suivre.',
      unsafe_or_unclear: 'Un problème qui peut toucher à la sécurité, ou qui n’a pas pu être classé. Le locataire a été invité à ne plus utiliser l’article ; la boutique le contactera.',
      unsorted: 'Un signalement pas encore classé. Le locataire sait que la boutique le contactera.',
    },
    text: (facts, kind) => `Un locataire de ${facts.itemLabel} chez ${facts.shopName} a signalé un problème pendant la location.\n\n${kind}\n\nUne personne doit s’en occuper : ${facts.incidentsUrl}`,
  },
  es: {
    subject: (item) => `Quien alquila ha informado de algo: ${item}`,
    kinds: {
      small_damage: 'Un daño menor. Confirma qué precio publicado se aplica, para que quien alquila pueda aceptarlo.',
      mechanical_fault: 'Una avería. Decide si cambiar, recoger o compensar, y asúmela como asunto de la tienda.',
      theft_or_loss: 'Un robo o una pérdida. Quien alquila recibió los pasos a seguir.',
      unsafe_or_unclear: 'Algo que puede afectar a la seguridad, o que no se pudo clasificar. Se pidió a quien alquila que deje de usar el artículo; la tienda se pondrá en contacto.',
      unsorted: 'Un informe aún sin clasificar. Quien alquila sabe que la tienda se pondrá en contacto.',
    },
    text: (facts, kind) => `Quien alquila ${facts.itemLabel} en ${facts.shopName} ha informado de algo durante el alquiler.\n\n${kind}\n\nUna persona debe revisarlo: ${facts.incidentsUrl}`,
  },
  de: {
    subject: (item) => `Eine mietende Person hat etwas gemeldet: ${item}`,
    kinds: {
      small_damage: 'Ein kleiner Schaden. Bestätigen Sie, welcher veröffentlichte Preis gilt, damit die mietende Person zustimmen kann.',
      mechanical_fault: 'Ein Defekt. Entscheiden Sie über Tausch, Abholung oder Entschädigung und übernehmen Sie ihn als Sache des Ladens.',
      theft_or_loss: 'Ein Diebstahl oder Verlust. Die mietende Person hat die festen Schritte erhalten.',
      unsafe_or_unclear: 'Etwas, das die Sicherheit betreffen kann oder nicht eingeordnet werden konnte. Die mietende Person wurde gebeten, den Artikel nicht weiter zu nutzen; der Laden meldet sich.',
      unsorted: 'Eine noch nicht eingeordnete Meldung. Die mietende Person weiß, dass der Laden sich meldet.',
    },
    text: (facts, kind) => `Eine mietende Person von ${facts.itemLabel} bei ${facts.shopName} hat während der Miete etwas gemeldet.\n\n${kind}\n\nEine Person muss sich darum kümmern: ${facts.incidentsUrl}`,
  },
}

export function incidentAlertEmail(to: string, language: string, facts: AlertFacts): Email {
  const words = WORDS[isLanguage(language) ? language : 'en']
  return { to, subject: words.subject(facts.itemLabel), text: words.text(facts, words.kinds[facts.kind ?? 'unsorted']) }
}
