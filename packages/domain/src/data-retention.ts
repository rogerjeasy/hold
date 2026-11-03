// How long Hold keeps evidence (architecture.md section 15.2), stated once so the evidence bucket's rules in infra/ and
// the privacy notice on the public site say the same thing.

// PayPal accepts a dispute for up to 180 days after a payment.
export const PAYPAL_DISPUTE_DAYS = 180

// An evidence photograph, its manifest and its evidence pack cannot be changed or deleted for this long after they are
// written (S3 Object Lock, in governance mode).
export const EVIDENCE_LOCK_DAYS = PAYPAL_DISPUTE_DAYS

// Then they are deleted, with the face-blurred copies made from them: one year after they were written. The year covers
// the lock, the longest a hold lets a charge come after the handover, and the dispute window after that charge.
export const EVIDENCE_KEPT_DAYS = 365

// The database's automated backups are kept this long, so an erased renter's details leave them this many days later.
export const BACKUP_KEPT_DAYS = 7
