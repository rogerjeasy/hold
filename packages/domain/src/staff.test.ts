import { describe, expect, it } from 'vitest'
import { money } from './money.ts'
import { mayInvite, needsStrongSignIn } from './staff.ts'

const chf = (cents: number) => money(cents, 'CHF')

describe('inviting staff', () => {
  it('lets the owner invite managers, counter staff and read-only members, and never another owner', () => {
    expect(['manager', 'counter_staff', 'read_only', 'owner'].map((role) => mayInvite('owner', role as never))).toEqual([true, true, true, false])
  })

  it('lets a manager invite counter staff and read-only members only', () => {
    expect(['manager', 'counter_staff', 'read_only'].map((role) => mayInvite('manager', role as never))).toEqual([false, true, true])
  })

  it('lets nobody else invite anyone', () => {
    expect(mayInvite('counter_staff', 'read_only')).toBe(false)
    expect(mayInvite('read_only', 'read_only')).toBe(false)
  })
})

describe('who needs more than an emailed code', () => {
  it('asks owners and managers for a passkey', () => {
    expect(needsStrongSignIn('owner', chf(0), undefined)).toBe(true)
    expect(needsStrongSignIn('manager', chf(0), chf(200_00))).toBe(true)
  })

  it('asks counter staff only when they may approve above the shop’s threshold', () => {
    expect(needsStrongSignIn('counter_staff', chf(200_00), chf(200_00))).toBe(false)
    expect(needsStrongSignIn('counter_staff', chf(200_01), chf(200_00))).toBe(true)
    expect(needsStrongSignIn('counter_staff', chf(500_00), undefined)).toBe(false)
  })

  it('never asks a read-only member', () => {
    expect(needsStrongSignIn('read_only', chf(1_000_00), chf(1))).toBe(false)
  })
})
