import type { ClaimPromise } from '@hold/db'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { PromiseBeforeContest, PromiseStatus } from './promise-status'

const now = new Date('2026-11-01T10:00:00Z')
const decideBy = new Date('2026-11-03T17:00:00Z')
const promise = (overrides: Partial<ClaimPromise> = {}): ClaimPromise => ({ days: 3, decideBy, decidedAt: null, missedAt: null, standing: 'open', missedReason: null, ...overrides })
const common = { shopName: 'Alpine Rentals', timeZone: 'Europe/Zurich', now }

describe('the promise, as the renter reads it', () => {
  it('is part of the decision to contest', () => {
    renderWithIntl(<PromiseBeforeContest shopName="Alpine Rentals" days={3} />)
    expect(screen.getByText('If you contest')).toBeInTheDocument()
    expect(screen.getByText(/Alpine Rentals promises to decide within 3 days of your reply/)).toBeInTheDocument()
  })

  it('is a date and the time left once the renter contested', () => {
    renderWithIntl(<PromiseStatus {...common} audience="renter" promise={promise()} claimState="contested" />)
    expect(screen.getByText('The shop decides by')).toBeInTheDocument()
    expect(screen.getByText('Tue, Nov 3, 06:00 PM')).toBeInTheDocument()
    expect(screen.getByText(/in 2 days/)).toBeInTheDocument()
  })

  it('says plainly when the shop missed it, and what happens now', () => {
    renderWithIntl(<PromiseStatus {...common} audience="renter" promise={promise({ standing: 'missed', missedAt: decideBy })} claimState="escalated" />)
    expect(screen.getByText('The shop missed its date')).toBeInTheDocument()
    expect(screen.getByText(/Only the owner can decide now, and they must give you a written reason/)).toBeInTheDocument()
  })

  it('shows the owner’s reason for a decision made after the date', () => {
    renderWithIntl(<PromiseStatus {...common} audience="renter" promise={promise({ standing: 'missed', missedAt: decideBy, decidedAt: new Date('2026-11-04T09:00:00Z'), missedReason: 'The scratch is new in the return photographs.' })} claimState="charging" />)
    expect(screen.getByText('Decided after the promised date')).toBeInTheDocument()
    expect(screen.getByText('The scratch is new in the return photographs.')).toBeInTheDocument()
  })

  it('says the claim was waived when the shop’s rule did it', () => {
    renderWithIntl(<PromiseStatus {...common} audience="renter" promise={promise({ standing: 'missed', missedAt: decideBy, decidedAt: decideBy })} claimState="waived" />)
    expect(screen.getByText('Waived: not decided in time')).toBeInTheDocument()
  })

  it('shows nothing before the renter contests', () => {
    const { container } = renderWithIntl(<PromiseStatus {...common} audience="renter" promise={promise({ standing: 'none', decideBy: null })} claimState="presented" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('the promise, as staff read it', () => {
  it('is the date they promised', () => {
    renderWithIntl(<PromiseStatus {...common} audience="shop" promise={promise()} claimState="contested" />)
    expect(screen.getByText('You promised to decide by')).toBeInTheDocument()
  })

  it('says it was missed and that only the owner decides', () => {
    renderWithIntl(<PromiseStatus {...common} audience="shop" promise={promise({ standing: 'missed', missedAt: decideBy })} claimState="escalated" />)
    expect(screen.getByText('Promise missed')).toBeInTheDocument()
    expect(screen.getByText(/Only the owner can decide now/)).toBeInTheDocument()
  })
})
