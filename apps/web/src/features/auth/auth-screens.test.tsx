import { screen, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { SignInScreen } from './sign-in-screen'
import { SignUpScreen } from './sign-up-screen'

const screens: [string, ReactElement, string][] = [
  ['sign-in', <SignInScreen key="in" />, 'Sign in to your shop.'],
  ['sign-up', <SignUpScreen key="up" />, 'Open your shop on Hold.'],
]

describe.each(screens)('the %s screen', (_name, element, title) => {
  it('has one top heading, and it names the page', () => {
    renderWithIntl(element)
    expect(screen.getAllByRole('heading', { level: 1 }).map((heading) => heading.textContent)).toEqual([title])
  })

  it('never skips a heading level on the way down', () => {
    renderWithIntl(element)
    const levels = screen.getAllByRole('heading').map((heading) => Number(heading.tagName.slice(1)))
    levels.slice(1).forEach((level, index) => {
      expect(level - (levels[index] ?? 0)).toBeLessThanOrEqual(1)
    })
  })

  it('tells counter staff they are invited, and renters that they need no account', () => {
    renderWithIntl(element)
    const notes = within(screen.getByRole('region', { name: 'Not the owner?' }))
    expect(notes.getByText(/The shop's owner invites you/)).toBeInTheDocument()
    expect(notes.getByText('You need no account. Open the link the shop sent you.')).toBeInTheDocument()
    expect(notes.getByRole('link', { name: 'See what a hold means for you' })).toHaveAttribute('href', '/for-renters')
  })

  it('has no link that only jumps within the page', () => {
    renderWithIntl(element)
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href') ?? '')
    expect(hrefs.filter((href) => href.includes('#'))).toEqual([])
  })
})

describe('SignInScreen', () => {
  it('sends someone without an account to sign-up', () => {
    renderWithIntl(<SignInScreen />)
    expect(screen.getByRole('link', { name: 'Create a shop account' })).toHaveAttribute('href', '/sign-up')
  })

  it('shows the shop that is waiting behind the sign-in', () => {
    renderWithIntl(<SignInScreen />)
    expect(screen.getByText('Example shop. Illustrative figures.')).toBeInTheDocument()
  })
})

describe('SignUpScreen', () => {
  it('sends someone with an account to sign-in', () => {
    renderWithIntl(<SignUpScreen />)
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
  })

  it('lays out the three steps after the form, in order', () => {
    renderWithIntl(<SignUpScreen />)
    const steps = within(screen.getByRole('list', { name: 'Three steps to your first protected rental.' })).getAllByRole('listitem')
    expect(steps.map((step) => within(step).getByRole('heading').textContent)).toEqual([
      'Confirm your email',
      "Connect your shop's PayPal account",
      'Write your price list',
    ])
  })
})
