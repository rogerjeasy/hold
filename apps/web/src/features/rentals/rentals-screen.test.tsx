import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { rentals } from './fixtures'
import { RentalsScreen } from './rentals-screen'
import type { RentalsScreenProps } from './rentals-screen'

const clock = { timeZone: 'Europe/Lisbon', currency: 'EUR' }

function show(props: Partial<RentalsScreenProps> = {}) {
  return renderWithIntl(
    <RentalsScreen shopName="Ribeira Bikes" clock={clock} rentals={Object.values(rentals)} show="all" canBook shopPageUrl="https://hold.test/s/ribeira-bikes" {...props} />,
  )
}

describe('the rentals page', () => {
  it('lists each rental with who, what, its two amounts and where it stands, in words', () => {
    show()
    const booked = screen.getByRole('listitem', { name: 'Lukas Weber' })
    expect(booked).toHaveTextContent('City e-bike 2, City e-bike 3')
    expect(booked).toHaveTextContent('€120.00')
    expect(booked).toHaveTextContent('€300.00')
    expect(booked).toHaveTextContent('Fee paid')
    expect(within(booked).getByRole('link', { name: 'Lukas Weber' })).toHaveAttribute('href', `/shop/rentals/${rentals.booked.id}`)
  })

  it('says when an unpaid booking ran out of time, who is not known yet, and where it was booked', () => {
    show()
    const lapsed = screen.getByRole('listitem', { name: 'Not paid yet' })
    expect(lapsed).toHaveTextContent('Time to pay ran out')
    expect(lapsed).toHaveTextContent("Booked on the shop's page")
  })

  it('says when a renter’s own assistant made the booking', () => {
    show()
    expect(screen.getByRole('listitem', { name: 'Mei Tanaka' })).toHaveTextContent("Booked by the renter's assistant")
  })

  it('marks a sample as a sample', () => {
    show()
    expect(screen.getByRole('listitem', { name: 'Julia Novak' })).toHaveTextContent('Sample')
  })

  it('shows one part of a rental’s life when asked', () => {
    show({ show: 'waiting' })
    expect(screen.getByRole('listitem', { name: 'Priya Natarajan' })).toBeInTheDocument()
    expect(screen.queryByRole('listitem', { name: 'Lukas Weber' })).not.toBeInTheDocument()
    expect(screen.queryByRole('listitem', { name: 'Not paid yet' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Waiting for the fee' })).toHaveAttribute('aria-current', 'page')
  })

  it('offers a new rental, and the shop’s own page for renters', () => {
    show()
    expect(screen.getAllByRole('link', { name: 'New rental' })[0]).toHaveAttribute('href', '/shop/rentals/new')
    expect(screen.getByRole('link', { name: 'https://hold.test/s/ribeira-bikes' })).toHaveAttribute('href', 'https://hold.test/s/ribeira-bikes')
  })

  it('starts an empty shop at its first rental', () => {
    show({ rentals: [] })
    expect(screen.getByText('No rentals yet')).toBeInTheDocument()
  })

  it('offers no booking to someone who may not book', () => {
    show({ canBook: false })
    expect(screen.queryByRole('link', { name: 'New rental' })).not.toBeInTheDocument()
  })
})
