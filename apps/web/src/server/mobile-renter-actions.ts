import 'server-only'
import type { RenterActionName } from '@hold/mobile-api'
import * as assistant from '@/features/assistant/renter-actions'
import * as claims from '@/features/claims/renter-actions'
import * as contact from '@/features/contact/renter-actions'
import * as extension from '@/features/extension/renter-actions'
import * as incidents from '@/features/incidents/renter-actions'
import * as negotiation from '@/features/negotiation/renter-actions'
import * as promise from '@/features/promise/renter-actions'
import * as push from '@/features/push/renter-actions'
import * as records from '@/features/records/renter-actions'
import * as renter from '@/features/renter/actions'
import * as selfReturn from '@/features/self-return/renter-actions'
import * as trust from '@/features/trust/renter-actions'
import type { RenterActionResult } from './renter-access'

// Each action the phone app may send, by its name in the contract, to the very server function the renter's web page
// calls. Nothing else is reachable: a name that is not here is not found. A test fails on any renter action that is
// neither here nor in NOT_ON_THE_PHONE with its reason.

export type RenterFormAction = (previous: unknown, data: FormData) => Promise<RenterActionResult<unknown>>

export const MOBILE_RENTER_ACTIONS: Readonly<Record<RenterActionName, RenterFormAction>> = {
  'pay-fee': renter.payFee,
  'confirm-fee': renter.confirmFee,
  'approve-hold': renter.approveHold,
  'confirm-hold': renter.confirmHold,
  'confirm-condition': renter.confirmCondition,
  'request-missed-upload': renter.requestMissedUpload,
  'confirm-missed-upload': renter.confirmMissedUpload,
  'send-missed': renter.sendMissed,
  'ask-extension': extension.askExtension,
  'pay-extension': extension.payExtension,
  'confirm-extension': extension.confirmExtension,
  'report-incident': incidents.reportIncident,
  'request-incident-upload': incidents.requestIncidentUpload,
  'confirm-incident-upload': incidents.confirmIncidentUpload,
  'send-incident-report': incidents.sendIncidentReport,
  'send-incident-code': incidents.sendIncidentCode,
  'agree-incident-price': incidents.agreeIncidentPrice,
  'leave-incident-to-return': incidents.leaveIncidentToReturn,
  'give-theft-details': incidents.giveTheftDetails,
  'give-police-report': incidents.givePoliceReport,
  'start-self-return': selfReturn.startSelfReturn,
  'request-self-return-upload': selfReturn.requestSelfReturnUpload,
  'confirm-self-return-upload': selfReturn.confirmSelfReturnUpload,
  'send-self-return': selfReturn.sendSelfReturn,
  'send-claim-code': claims.sendClaimCode,
  'accept-claim': claims.acceptClaim,
  'contest-claim': claims.contestClaim,
  'acknowledge-claim': claims.acknowledgeClaim,
  'write-to-shop': promise.writeToShop,
  'start-advocate': negotiation.startAdvocate,
  'send-settlement-code': negotiation.sendSettlementCode,
  'confirm-settlement': negotiation.confirmSettlement,
  'stop-advocate': negotiation.stopAdvocate,
  'send-trust-code': trust.sendTrustCode,
  'answer-consent': trust.answerConsent,
  'delete-record': trust.deleteRecord,
  'send-phone-code': contact.sendPhoneCode,
  'confirm-phone': contact.confirmPhone,
  'choose-email': contact.chooseEmail,
  'send-contact-change-code': contact.sendContactChangeCode,
  'disconnect-assistant': assistant.disconnectAssistant,
  'build-renter-record': records.buildRenterRecord,
  'download-renter-record': records.downloadRenterRecord,
  'register-push': push.registerPush,
  'unregister-push': push.unregisterPush,
}

// Renter actions the phone does not send, by file and export, each with its reason. None today: the phone does
// everything the renter's link does, and PayPal's approval stays on PayPal's own page.
export const NOT_ON_THE_PHONE: Readonly<Record<string, string>> = {}
