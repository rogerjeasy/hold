import { RENTER_PUSH_PAGES } from '@hold/domain'
import type { RenterPushEvent, StaffPushEvent } from '@hold/domain'
import type { PushMessage } from './push.ts'

// The words of every push Hold sends (architecture.md section 13.9). A push travels through Expo, Apple and Google, and
// shows on a locked screen, so it says only which shop and what happened, generically, in the reader's language: never
// a link, a code, an amount, a name, an email or a phone. The data holds only what the app routes the tap with.

type Language = 'en' | 'fr' | 'de' | 'es'
const isLanguage = (value: string): value is Language => ['en', 'fr', 'de', 'es'].includes(value)

const RENTER: Readonly<Record<Language, Readonly<Record<RenterPushEvent, string>>>> = {
  en: {
    condition_ready: 'Your condition report is ready to check.',
    return_checked: 'There is news about your return.',
    shop_message: 'The shop wrote to you.',
    due_back: 'A reminder about your rental.',
    hold_needed: 'Your rental needs a new hold. Open it to approve one.',
    promise_missed: 'There is news about your claim.',
    receipt: 'Your receipt is ready.',
    claim_ready: 'Your claim is ready to read.',
    claim_decided: 'The shop has decided on your claim.',
  },
  fr: {
    condition_ready: 'Votre état des lieux est prêt à vérifier.',
    return_checked: 'Il y a du nouveau sur votre retour.',
    shop_message: 'Le magasin vous a écrit.',
    due_back: 'Un rappel concernant votre location.',
    hold_needed: 'Votre location demande une nouvelle empreinte. Ouvrez-la pour l’approuver.',
    promise_missed: 'Il y a du nouveau sur votre réclamation.',
    receipt: 'Votre reçu est prêt.',
    claim_ready: 'Votre réclamation est prête à lire.',
    claim_decided: 'Le magasin a tranché votre réclamation.',
  },
  de: {
    condition_ready: 'Ihr Zustandsbericht ist bereit zur Prüfung.',
    return_checked: 'Es gibt Neuigkeiten zu Ihrer Rückgabe.',
    shop_message: 'Das Geschäft hat Ihnen geschrieben.',
    due_back: 'Eine Erinnerung zu Ihrer Miete.',
    hold_needed: 'Ihre Miete braucht eine neue Reservierung. Öffnen Sie sie, um sie zu bestätigen.',
    promise_missed: 'Es gibt Neuigkeiten zu Ihrer Forderung.',
    receipt: 'Ihre Quittung ist bereit.',
    claim_ready: 'Ihre Forderung ist bereit zum Lesen.',
    claim_decided: 'Das Geschäft hat über Ihre Forderung entschieden.',
  },
  es: {
    condition_ready: 'Tu informe de estado está listo para revisar.',
    return_checked: 'Hay novedades sobre tu devolución.',
    shop_message: 'La tienda te ha escrito.',
    due_back: 'Un recordatorio sobre tu alquiler.',
    hold_needed: 'Tu alquiler necesita una nueva retención. Ábrelo para aprobarla.',
    promise_missed: 'Hay novedades sobre tu reclamación.',
    receipt: 'Tu recibo está listo.',
    claim_ready: 'Tu reclamación está lista para leer.',
    claim_decided: 'La tienda ha decidido sobre tu reclamación.',
  },
}

const STAFF: Readonly<Record<Language, Readonly<Record<StaffPushEvent, string>>>> = {
  en: {
    drop_off_waiting: 'A drop-off is waiting to be checked.',
    renter_message: 'A renter wrote to you.',
    comparison_ready: 'A return comparison is ready to review.',
    decision_waiting: 'A decision is waiting for you on the web.',
  },
  fr: {
    drop_off_waiting: 'Un dépôt attend d’être vérifié.',
    renter_message: 'Un client vous a écrit.',
    comparison_ready: 'Une comparaison de retour est prête à revoir.',
    decision_waiting: 'Une décision vous attend sur le web.',
  },
  de: {
    drop_off_waiting: 'Eine Abgabe wartet auf die Prüfung.',
    renter_message: 'Ein Mieter hat Ihnen geschrieben.',
    comparison_ready: 'Ein Rückgabevergleich ist bereit zur Prüfung.',
    decision_waiting: 'Eine Entscheidung wartet im Web auf Sie.',
  },
  es: {
    drop_off_waiting: 'Una entrega espera ser revisada.',
    renter_message: 'Un cliente te ha escrito.',
    comparison_ready: 'Una comparación de devolución está lista para revisar.',
    decision_waiting: 'Una decisión te espera en la web.',
  },
}

type Words = Omit<PushMessage, 'to'>

// `reference` is the random name this phone was given for the rental when it registered; only the phone knows which
// of its saved links it stands for.
export function renterPush(event: RenterPushEvent, facts: { readonly shopName: string; readonly language: string; readonly reference: string }): Words {
  return { title: facts.shopName, body: RENTER[isLanguage(facts.language) ? facts.language : 'en'][event], data: { kind: 'renter', reference: facts.reference, page: RENTER_PUSH_PAGES[event] } }
}

// `path` is the counter screen to open (staffPushPath), and `shopId` the shop it is in, so a person in two shops opens
// it in the right one.
export function staffPush(event: StaffPushEvent, facts: { readonly shopName: string; readonly language: string; readonly shopId: string; readonly path: string }): Words {
  return { title: facts.shopName, body: STAFF[isLanguage(facts.language) ? facts.language : 'en'][event], data: { kind: 'staff', shopId: facts.shopId, path: facts.path } }
}
