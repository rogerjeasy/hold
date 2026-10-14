import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { BothSides } from './both-sides'

const shop = () => within(screen.getByRole('figure', { name: 'Jonas, at the counter' }))
const renter = () => within(screen.getByRole('figure', { name: 'Priya, the renter' }))

describe('BothSides', () => {
  it('shows the shop and the renter the same finding at the same price', () => {
    renderWithIntl(<BothSides />)
    for (const side of [shop(), renter()]) {
      expect(side.getByText('Scratched frame')).toBeInTheDocument()
      expect(side.getByText('€35')).toBeInTheDocument()
    }
  })

  it('shows both sides that the old scuff costs nothing', () => {
    renderWithIntl(<BothSides />)
    for (const side of [shop(), renter()]) {
      expect(side.getByText('Down tube scuff')).toBeInTheDocument()
      expect(side.getByText('€0')).toBeInTheDocument()
    }
  })

  it('gives the shop the approval', () => {
    renderWithIntl(<BothSides />)
    expect(shop().getByText('1 new mark found')).toBeInTheDocument()
    expect(shop().getByText('Approve claim · €35')).toBeInTheDocument()
  })

  it('gives the renter a way to accept and a way to disagree', () => {
    renderWithIntl(<BothSides />)
    expect(renter().getByText('The shop is asking for €35')).toBeInTheDocument()
    expect(renter().getByText('Accept')).toBeInTheDocument()
    expect(renter().getByText('I disagree')).toBeInTheDocument()
    expect(renter().getByText('€35 taken, €265 released')).toBeInTheDocument()
  })

  it('joins the two screens with one hold', () => {
    renderWithIntl(<BothSides />)
    const hold = within(screen.getByRole('group', { name: 'Hold 2291' }))
    expect(hold.getByText('€300.00')).toBeInTheDocument()
    expect(hold.getByText('€35.00')).toBeInTheDocument()
    expect(hold.getByText('€265.00')).toBeInTheDocument()
  })

  it('draws the screens as pictures, with no control that could be pressed', () => {
    renderWithIntl(<BothSides />)
    expect(screen.queryAllByRole('button')).toEqual([])
  })
})
