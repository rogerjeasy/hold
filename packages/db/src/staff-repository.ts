import { createHash, randomBytes } from 'node:crypto'
import { addDays, INVITATION_DAYS } from '@hold/domain'
import type { StaffRole } from '@hold/domain'
import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm'
import { auditLog, staffInvitations, staffRoles, users } from './schema/index.ts'
import { inShop, outsideShop } from './scope.ts'
import type { Database, Transaction } from './scope.ts'

// The people of one shop and the invitations still open. Every function taking a transaction runs inside inShop.

export type StaffMember = {
  readonly userId: string
  readonly email: string
  readonly name: string | null
  readonly role: StaffRole
  readonly approvalLimitCents: number
}

export function listStaff(transaction: Transaction): Promise<StaffMember[]> {
  return transaction
    .select({ userId: users.id, email: users.email, name: users.name, role: staffRoles.role, approvalLimitCents: staffRoles.approvalLimitCents })
    .from(staffRoles)
    .innerJoin(users, eq(users.id, staffRoles.userId))
    .orderBy(asc(staffRoles.createdAt))
}

export type OpenInvitation = { readonly id: string; readonly email: string; readonly role: StaffRole; readonly expiresAt: Date }

export function listOpenInvitations(transaction: Transaction, now: Date): Promise<OpenInvitation[]> {
  return transaction
    .select({ id: staffInvitations.id, email: staffInvitations.email, role: staffInvitations.role, expiresAt: staffInvitations.expiresAt })
    .from(staffInvitations)
    .where(and(isNull(staffInvitations.acceptedAt), isNull(staffInvitations.revokedAt), gt(staffInvitations.expiresAt, now)))
    .orderBy(asc(staffInvitations.createdAt))
}

// Only the fingerprint is kept, so the table alone cannot be used to accept an invitation.
export function tokenFingerprint(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export type NewInvitation = {
  readonly shopId: string
  readonly invitedByUserId: string
  readonly email: string
  readonly role: StaffRole
  readonly approvalLimitCents: number
  readonly language: string
}

// Returns the token for the link. It is shown once, in the email, and never stored.
export async function createInvitation(transaction: Transaction, invitation: NewInvitation, now: Date): Promise<{ id: string; token: string }> {
  const token = randomBytes(32).toString('base64url')
  const [created] = await transaction
    .insert(staffInvitations)
    .values({ ...invitation, email: invitation.email.toLowerCase(), tokenFingerprint: tokenFingerprint(token), expiresAt: addDays(now, INVITATION_DAYS) })
    .returning({ id: staffInvitations.id })
  if (created === undefined) throw new Error('The invitation was not created.')
  return { id: created.id, token }
}

export async function revokeInvitation(transaction: Transaction, invitationId: string, now: Date): Promise<boolean> {
  const revoked = await transaction
    .update(staffInvitations)
    .set({ revokedAt: now })
    .where(and(eq(staffInvitations.id, invitationId), isNull(staffInvitations.acceptedAt), isNull(staffInvitations.revokedAt)))
    .returning({ id: staffInvitations.id })
  return revoked.length > 0
}

export type InvitationForLink = {
  readonly id: string
  readonly shopId: string
  readonly shopName: string
  readonly email: string
  readonly role: StaffRole
  readonly language: string
  readonly state: 'open' | 'accepted' | 'revoked' | 'expired'
}

// What a link's token opens, read before any shop is chosen. Nothing for a token that names no invitation.
export async function findInvitation(database: Database, token: string, now: Date): Promise<InvitationForLink | undefined> {
  const [row] = await outsideShop(database, (transaction) =>
    transaction
      .select({
        id: sql<string>`id`,
        shopId: sql<string>`shop_id`,
        shopName: sql<string>`shop_name`,
        email: sql<string>`email`,
        role: sql<StaffRole>`role`,
        language: sql<string>`language`,
        expiresAt: sql<string>`expires_at`,
        acceptedAt: sql<string | null>`accepted_at`,
        revokedAt: sql<string | null>`revoked_at`,
      })
      .from(sql`hold_invitation_by_token(${tokenFingerprint(token)})`),
  )
  if (row === undefined) return undefined
  const state = row.acceptedAt !== null ? 'accepted' : row.revokedAt !== null ? 'revoked' : new Date(row.expiresAt) <= now ? 'expired' : 'open'
  return { id: row.id, shopId: row.shopId, shopName: row.shopName, email: row.email, role: row.role, language: row.language, state }
}

export type Acceptance = {
  readonly token: string
  // As the identity service verified them, after the person typed the emailed code.
  readonly subject: string
  readonly email: string
  readonly name: string
  readonly language: string
}

export type AcceptanceResult = { readonly ok: true; readonly shopId: string } | { readonly ok: false; readonly reason: 'not_open' | 'other_address' }

// Gives the person their role in the shop. The address they proved must be the one invited.
export async function acceptInvitation(database: Database, acceptance: Acceptance, now: Date): Promise<AcceptanceResult> {
  const invitation = await findInvitation(database, acceptance.token, now)
  if (invitation?.state !== 'open') return { ok: false, reason: 'not_open' }
  if (invitation.email.toLowerCase() !== acceptance.email.toLowerCase()) return { ok: false, reason: 'other_address' }
  return inShop(database, { role: 'hold_app', shopId: invitation.shopId }, async (transaction) => {
    const [registered] = await transaction
      .select({ userId: sql<string>`registered.id` })
      .from(sql`hold_register_user(${acceptance.subject}, ${acceptance.email}, ${acceptance.name}, ${acceptance.language}) as registered(id)`)
    if (registered === undefined) throw new Error('hold_register_user returned no row.')
    const [details] = await transaction
      .update(staffInvitations)
      .set({ acceptedAt: now, acceptedByUserId: registered.userId })
      .where(and(eq(staffInvitations.id, invitation.id), isNull(staffInvitations.acceptedAt), isNull(staffInvitations.revokedAt)))
      .returning({ role: staffInvitations.role, approvalLimitCents: staffInvitations.approvalLimitCents })
    if (details === undefined) return { ok: false, reason: 'not_open' } as const
    // Someone who already works here keeps the role they have.
    await transaction
      .insert(staffRoles)
      .values({ shopId: invitation.shopId, userId: registered.userId, role: details.role, approvalLimitCents: details.approvalLimitCents })
      .onConflictDoNothing()
    await transaction.insert(auditLog).values({
      shopId: invitation.shopId,
      actorKind: 'person',
      actorId: registered.userId,
      action: 'invitation.accepted',
      subjectKind: 'staff_invitation',
      subjectId: invitation.id,
    })
    return { ok: true, shopId: invitation.shopId } as const
  })
}

// The person's own role and approval limit in the transaction's shop.
export async function staffRoleOf(transaction: Transaction, userId: string): Promise<{ role: StaffRole; approvalLimitCents: number } | undefined> {
  const [row] = await transaction
    .select({ role: staffRoles.role, approvalLimitCents: staffRoles.approvalLimitCents })
    .from(staffRoles)
    .where(eq(staffRoles.userId, userId))
  return row
}
