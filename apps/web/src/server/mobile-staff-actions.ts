import 'server-only'
import type { StaffActionName } from '@hold/mobile-api'
import * as handover from '@/features/handover/actions'
import { changeItemStatus } from '@/features/items/actions'
import { writeToRenter } from '@/features/promise/actions'
import { registerPush, unregisterPush } from '@/features/push/actions'
import { askForHold, sendRenterLinkAgain, showRenterLink } from '@/features/rentals/actions'
import * as returns from '@/features/returns/actions'
import { confirmDropOff, reportDropOffMissing } from '@/features/self-return/actions'

// The counter's quick actions the phone may ask for, and nothing else: each is the web's own server function, and none
// asks for a passkey (a test checks both). Approving, charging and releasing, prices, staff and PayPal stay on the web,
// where a passkey confirms the person. So do booking, which takes the renter's fee, letting go of a booking, preparing a
// claim and confirming an incident's price, each a money decision a person makes at a desk, not at the counter.
export const STAFF_ACTION_ROUTES = {
  'start-handover': handover.startHandover,
  'request-handover-photo': handover.requestPhotoUpload,
  'record-handover-photo': handover.confirmPhotoUpload,
  'add-handover-mark': handover.addHandoverMark,
  'confirm-known-marks': handover.confirmKnownMarks,
  'seal-handover': handover.sealHandover,
  'start-return': returns.startReturn,
  'request-return-photo': returns.requestPhotoUpload,
  'record-return-photo': returns.confirmPhotoUpload,
  'seal-return': returns.sealReturn,
  'record-review': returns.recordReview,
  'confirm-drop-off': confirmDropOff,
  'report-drop-off-missing': reportDropOffMissing,
  'show-renter-link': showRenterLink,
  'send-renter-link': sendRenterLinkAgain,
  'ask-for-hold': askForHold,
  'change-item-status': changeItemStatus,
  'write-to-renter': writeToRenter,
  'register-push': registerPush,
  'unregister-push': unregisterPush,
} as const satisfies Record<StaffActionName, unknown>
