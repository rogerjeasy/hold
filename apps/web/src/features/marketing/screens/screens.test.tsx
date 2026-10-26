import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { AiScreen } from './ai-screen'
import { DemoScreen } from './demo-screen'
import { ForRentersScreen } from './for-renters-screen'
import { ForShopsScreen } from './for-shops-screen'
import { HomeScreen } from './home-screen'
import { HowItWorksScreen } from './how-it-works-screen'
import { PaypalScreen } from './paypal-screen'

const screens: [string, ReactElement, string][] = [
  ['home', <HomeScreen key="home" />, 'One photograph settles it.'],
  ['how it works', <HowItWorksScreen key="how" />, 'One rental, four moments.'],
  ['for shops', <ForShopsScreen key="shops" />, 'Protect every item without charging the people who bring it back.'],
  ['for renters', <ForRentersScreen key="renters" />, 'Keep your money while you rent.'],
  ['the AI', <AiScreen key="ai" />, 'The AI compares. A person decides.'],
  ['PayPal', <PaypalScreen key="paypal" />, 'Reserved is not charged. PayPal makes that real.'],
  ['demo', <DemoScreen key="demo" />, 'Try a return yourself.'],
]

function headingLevels(): number[] {
  return screen.getAllByRole('heading').map((heading) => Number(heading.tagName.slice(1)))
}

describe.each(screens)('the %s screen', (_name, element, title) => {
  it('has one top heading, and it names the page', () => {
    renderWithIntl(element)
    expect(screen.getAllByRole('heading', { level: 1 }).map((heading) => heading.textContent)).toEqual([title])
  })

  it('never skips a heading level on the way down', () => {
    renderWithIntl(element)
    const levels = headingLevels()
    expect(levels[0]).toBe(1)
    levels.slice(1).forEach((level, index) => {
      expect(level - (levels[index] ?? 0)).toBeLessThanOrEqual(1)
    })
  })

  it('never repeats a heading', () => {
    renderWithIntl(element)
    const names = screen.getAllByRole('heading').map((heading) => heading.textContent)
    expect(new Set(names).size).toBe(names.length)
  })

  it('gives the reader a next page to go to', () => {
    renderWithIntl(element)
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href') ?? '')
    expect(hrefs.length).toBeGreaterThan(0)
    expect(hrefs.filter((href) => href.includes('#'))).toEqual([])
  })
})

describe('HomeScreen', () => {
  it('puts the two phones straight after the photograph', () => {
    renderWithIntl(<HomeScreen />)
    const sections = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(sections[0]).toBe('The shop and the renter look at the same thing.')
    expect(sections).toEqual([
      'The shop and the renter look at the same thing.',
      'One rental, four moments.',
      'Protect every item without charging the people who bring it back.',
      'Keep your money while you rent.',
      'The AI compares. A person decides.',
      'Reserved is not charged. PayPal makes that real.',
      'Try a return yourself.',
    ])
  })

  it('shows five PayPal capabilities and leaves the rest to the PayPal page', () => {
    renderWithIntl(<HomeScreen />)
    expect(within(screen.getByRole('table')).getAllByRole('rowheader')).toHaveLength(5)
  })
})

describe('HowItWorksScreen', () => {
  it('lets the reader try the comparison', () => {
    renderWithIntl(<HowItWorksScreen />)
    expect(screen.getByRole('slider')).toBeInTheDocument()
  })

  it('tells the rental as four moments, in order', () => {
    renderWithIntl(<HowItWorksScreen />)
    expect(screen.getAllByRole('heading', { level: 3 }).slice(0, 4).map((heading) => heading.textContent)).toEqual([
      'Reserve',
      'Hand over',
      'Return',
      'Settle',
    ])
  })

  it('shows the renter the fee and the hold as two separate amounts before approving', () => {
    renderWithIntl(<HowItWorksScreen />)
    const phone = within(screen.getByRole('figure', { name: 'Priya, before she collects the bike' }))
    expect(phone.getByText('€120')).toBeInTheDocument()
    expect(phone.getByText('€300')).toBeInTheDocument()
    expect(phone.getByText('Reserved, not charged')).toBeInTheDocument()
  })

  it('lists the six views in the condition report', () => {
    renderWithIntl(<HowItWorksScreen />)
    expect(within(screen.getByRole('group', { name: 'Condition report' })).getAllByRole('listitem')).toHaveLength(6)
  })

  it('ends a clean return with nothing taken, and a damaged one with only the claim taken', () => {
    renderWithIntl(<HowItWorksScreen />)
    expect(screen.getByText('Your bike is back safely. The €300 hold has been released. Nothing was charged.')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '€300 reserved, €0 taken, €300 released' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '€300 reserved, €35 taken, €265 released' })).toBeInTheDocument()
  })

  it('answers the questions asked at the counter', () => {
    renderWithIntl(<HowItWorksScreen />)
    expect(screen.getByRole('heading', { level: 3, name: 'Is a hold a charge?' })).toBeInTheDocument()
    expect(screen.getByText(/Nothing is taken unless a person approves a claim\./)).toBeInTheDocument()
  })

  it('explains what happens when the renter disagrees', () => {
    renderWithIntl(<HowItWorksScreen />)
    expect(screen.getByRole('heading', { level: 2, name: 'If the renter disagrees.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'The owner decides' })).toBeInTheDocument()
  })
})

describe('ForShopsScreen', () => {
  it('names the six kinds of shop it is built for', () => {
    renderWithIntl(<ForShopsScreen />)
    expect(screen.getByRole('heading', { level: 3, name: 'Bikes, e-bikes and scooters' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Baby equipment, instruments and formalwear' })).toBeInTheDocument()
  })

  it('shows the owner the day at a glance, with what needs a decision', () => {
    renderWithIntl(<ForShopsScreen />)
    expect(screen.getByText('Holds in place').nextElementSibling).toHaveTextContent('€4,200')
    expect(screen.getByText('Hold 2291 · a claim of €35 awaits approval')).toBeInTheDocument()
    expect(screen.getByText('Hold 2274 · day 26 of 29')).toBeInTheDocument()
  })

  it('dates every entry in the item passport', () => {
    renderWithIntl(<ForShopsScreen />)
    for (const date of ['Sep 2, 2026', 'Oct 14, 2026', 'Oct 17, 2026']) {
      expect(screen.getByText(date)).toBeInTheDocument()
    }
  })

  it('says that no charge happens without a person', () => {
    renderWithIntl(<ForShopsScreen />)
    expect(screen.getByRole('heading', { level: 3, name: 'No automatic charges' })).toBeInTheDocument()
  })

  it('offers the demo shop', () => {
    renderWithIntl(<ForShopsScreen />)
    expect(screen.getAllByRole('link', { name: 'Open the demo shop' })[0]).toHaveAttribute('href', '/demo')
  })
})

describe('ForRentersScreen', () => {
  it('lists six things a renter can count on', () => {
    renderWithIntl(<ForRentersScreen />)
    for (const name of ['Told before you pay', 'No surprise charges', 'A real right to reply', 'Your money stays yours']) {
      expect(screen.getByRole('heading', { level: 3, name })).toBeInTheDocument()
    }
  })

  it('sets a deposit beside a hold: one leaves the account, the other does not', () => {
    renderWithIntl(<ForRentersScreen />)
    const [deposit, hold] = [screen.getByRole('heading', { name: 'With a deposit' }), screen.getByRole('heading', { name: 'With a hold' })].map(
      (heading) => within(heading.closest('li') ?? heading),
    )
    expect(deposit?.getByText('−€300')).toBeInTheDocument()
    expect(hold?.getByText('€300 reserved')).toBeInTheDocument()
    expect(hold?.getByText('€0')).toBeInTheDocument()
  })

  it('publishes the price of each kind of damage', () => {
    renderWithIntl(<ForRentersScreen />)
    expect(screen.getByText('Missing charger').nextElementSibling).toHaveTextContent('€60')
  })

  it('shows the renter the screen they would see', () => {
    renderWithIntl(<ForRentersScreen />)
    expect(screen.getByRole('figure', { name: 'Priya, the renter' })).toBeInTheDocument()
  })
})

describe('AiScreen', () => {
  it('says what the AI does when it is unsure', () => {
    renderWithIntl(<AiScreen />)
    expect(screen.getByRole('heading', { level: 3, name: 'It defers to a person' })).toBeInTheDocument()
  })
})

describe('AiScreen pipeline', () => {
  it('gives the model one step of seven, and a person the last', () => {
    renderWithIntl(<AiScreen />)
    const steps = within(screen.getAllByRole('list')[0] ?? document.body).getAllByRole('listitem')
    expect(steps).toHaveLength(7)
    expect(steps.filter((step) => within(step).queryByText('The AI model') !== null)).toHaveLength(1)
    expect(within(steps[6] ?? document.body).getByText('A person')).toBeInTheDocument()
  })

  it('lists no tier that charges', () => {
    renderWithIntl(<AiScreen />)
    expect(screen.getByText('There is no such tier. No tool takes an amount, and no agent can start a charge.')).toBeInTheDocument()
  })

  it('sends the reader to the published scorecard, with its counts', () => {
    renderWithIntl(<AiScreen />)
    expect(within(screen.getByRole('note')).getByText('Every figure is published with its count.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See the measured accuracy' })).toHaveAttribute('href', '/reliability')
  })
})

describe('PaypalScreen', () => {
  it('ends the life of a hold with a partial capture, or with a void on a clean return', async () => {
    renderWithIntl(<PaypalScreen />)
    expect(screen.getByText('/v2/payments/authorizations/{id}/capture')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clean return' }))
    expect(screen.queryByText('/v2/payments/authorizations/{id}/capture')).not.toBeInTheDocument()
    expect(screen.getByText('/v2/payments/authorizations/{id}/void')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '€300 reserved, €0 taken, €300 released' })).toBeInTheDocument()
  })

  it('lists every PayPal capability the rental uses', () => {
    renderWithIntl(<PaypalScreen />)
    expect(within(screen.getByRole('table')).getAllByRole('rowheader')).toHaveLength(8)
  })

  it('says how long a hold can stay open', () => {
    renderWithIntl(<PaypalScreen />)
    expect(screen.getByText(/up to 29 days\. Many card holds/)).toBeInTheDocument()
  })
})

describe('DemoScreen', () => {
  it('says plainly that the demo shop is not open yet', () => {
    renderWithIntl(<DemoScreen />)
    expect(within(screen.getByRole('note')).getByText('The demo shop is not open yet.')).toBeInTheDocument()
  })

  it('describes the three sample rentals', () => {
    renderWithIntl(<DemoScreen />)
    for (const name of ['A clean return', 'A scratch', 'A contested claim']) {
      expect(screen.getByRole('heading', { level: 3, name })).toBeInTheDocument()
    }
  })

  it('keeps the contested hold whole until the owner decides', () => {
    renderWithIntl(<DemoScreen />)
    expect(screen.getByText('Held until the owner decides')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '€300 reserved, nothing taken' })).toBeInTheDocument()
  })

  it('labels what is simulated', () => {
    renderWithIntl(<DemoScreen />)
    expect(within(screen.getByRole('list', { name: 'Simulated' })).getAllByRole('listitem')).toHaveLength(3)
  })

  it('sends the reader on to how it works', () => {
    renderWithIntl(<DemoScreen />)
    expect(screen.getByRole('link', { name: 'See how it works' })).toHaveAttribute('href', '/how-it-works')
  })
})
