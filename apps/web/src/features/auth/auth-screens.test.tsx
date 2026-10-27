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

  it('offers the demo shop’s two accounts only where demo mode is on', () => {
    renderWithIntl(<SignInScreen />)
    expect(screen.queryByRole('region', { name: 'Try the demo shop' })).not.toBeInTheDocument()
  })

  // Each demo is the judge's own: a fresh one every time they start, with its own shop and accounts.
  it('offers a judge a fresh demo of their own, as the owner or the counter staff, marked as a demo', () => {
    renderWithIntl(<SignInScreen demo="new" />)
    const demo = within(screen.getByRole('region', { name: 'Try the demo shop' }))
    const owner = demo.getByRole('button', { name: 'Start a demo as Tomás, the owner' })
    expect(owner).toHaveAttribute('value', 'owner')
    expect(demo.getByRole('button', { name: 'Start a demo as Jonas, at the counter' })).toHaveAttribute('value', 'staff')
    expect(owner.closest('form')?.querySelector('input[name="demo"]')).toHaveAttribute('value', 'start')
    expect(demo.queryByRole('button', { name: /^Continue/ })).not.toBeInTheDocument()
    expect(demo.getByText('Demo')).toBeInTheDocument()
    // The ordinary sign-in stays for everyone else.
    expect(screen.getByRole('button', { name: 'Email me a code' })).toBeInTheDocument()
  })

  it('lets the browser that started a demo come back to it as either person, or start a fresh one', () => {
    renderWithIntl(<SignInScreen demo="current" />)
    const demo = within(screen.getByRole('region', { name: 'Try the demo shop' }))
    const staff = demo.getByRole('button', { name: 'Continue as Jonas, at the counter' })
    expect(staff).toHaveAttribute('value', 'staff')
    expect(staff.closest('form')?.querySelector('input[name="demo"]')).toHaveAttribute('value', 'continue')
    expect(demo.getByRole('button', { name: 'Continue as Tomás, the owner' })).toHaveAttribute('value', 'owner')
    const fresh = demo.getByRole('button', { name: 'Start a fresh demo' })
    expect(fresh.closest('form')?.querySelector('input[name="demo"]')).toHaveAttribute('value', 'start')
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
