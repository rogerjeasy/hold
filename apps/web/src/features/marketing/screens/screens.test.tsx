import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { BACKUP_KEPT_DAYS, EVIDENCE_KEPT_DAYS, EVIDENCE_LOCK_DAYS } from '@hold/domain'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { AdvocatesScreen } from './advocates-screen'
import { AiScreen } from './ai-screen'
import { DemoScreen } from './demo-screen'
import { ForRentersScreen } from './for-renters-screen'
import { ForShopsScreen } from './for-shops-screen'
import { HomeScreen } from './home-screen'
import { HowItWorksScreen } from './how-it-works-screen'
import { PaypalScreen } from './paypal-screen'
import { PrivacyScreen } from './privacy-screen'
import { TermsScreen } from './terms-screen'

const screens: [string, ReactElement, string][] = [
  ['home', <HomeScreen key="home" />, 'One photograph settles it.'],
  ['how it works', <HowItWorksScreen key="how" />, 'One rental, four moments.'],
  ['advocates', <AdvocatesScreen key="advocates" />, 'Two advocates argue it. Code referees. People decide.'],
  ['for shops', <ForShopsScreen key="shops" />, 'Protect every item without charging the people who bring it back.'],
  ['for renters', <ForRentersScreen key="renters" />, 'Keep your money while you rent.'],
  ['the AI', <AiScreen key="ai" />, 'Code finds. The AI explains. A person decides.'],
  ['PayPal', <PaypalScreen key="paypal" />, 'Reserved is not charged. PayPal makes that real.'],
  ['demo', <DemoScreen key="demo" />, 'Try a return yourself.'],
  ['privacy', <PrivacyScreen key="privacy" />, 'Privacy notice'],
  ['terms', <TermsScreen key="terms" />, 'Terms of use'],
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
  it('leads with the advocates and what Hold joins to the hold, then the two phones', () => {
    renderWithIntl(<HomeScreen />)
    const sections = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(sections).toEqual([
      'When they disagree, two advocates argue it.',
      'What Hold joins to the hold.',
      'The shop and the renter look at the same thing.',
      'One rental, four moments.',
      'Protect every item without charging the people who bring it back.',
      'Keep your money while you rent.',
      'Reserved is not charged. PayPal makes that real.',
      'Try a return yourself.',
    ])
  })

  it('shows the recorded run closing from the claim to the agreement, and links to all of it', () => {
    renderWithIntl(<HomeScreen />)
    const ladder = within(screen.getByRole('figure', { name: /A live run on the demonstration's sample claim/ }))
    expect(ladder.getByText('Agreed: €25.00')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Read the whole recorded run' })).toHaveAttribute('href', '/advocates')
  })

  it('sends each part Hold joins to the hold to the page where it runs', () => {
    renderWithIntl(<HomeScreen />)
    const joined = within(screen.getByRole('region', { name: 'What Hold joins to the hold.' }))
    expect(joined.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/ai', '/ai', '/verify', '/reliability'])
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

  it('lets two advocates argue a contest, and links to their recorded run', () => {
    renderWithIntl(<HowItWorksScreen />)
    expect(screen.getByRole('heading', { level: 3, name: 'Or two advocates argue it' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See the advocates’ recorded run' })).toHaveAttribute('href', '/advocates')
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

  it('shows the operations agent reading PayPal without the power to charge', () => {
    renderWithIntl(<AiScreen />)
    expect(screen.getByRole('heading', { level: 2, name: 'An operations agent that reads PayPal and cannot charge.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Read-only in PayPal' })).toBeInTheDocument()
  })

  it('shows a night’s queue as the operations agent wrote it, from a recorded run', () => {
    renderWithIntl(<AiScreen />)
    expect(screen.getByRole('heading', { level: 2, name: 'One night’s queue, as the agent wrote it.' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Send this answer to PayPal on the dispute' })).toBeInTheDocument()
  })

  it('gives every damage finding an independent second look', () => {
    renderWithIntl(<AiScreen />)
    expect(screen.getByRole('heading', { level: 3, name: 'Look again' })).toBeInTheDocument()
  })
})

describe('AiScreen pipeline', () => {
  it('gives the model two steps of eight, a first look and a second, and a person the last', () => {
    renderWithIntl(<AiScreen />)
    const steps = within(screen.getAllByRole('list')[0] ?? document.body).getAllByRole('listitem')
    expect(steps).toHaveLength(8)
    expect(steps.filter((step) => within(step).queryByText('The AI model') !== null)).toHaveLength(2)
    expect(within(steps[7] ?? document.body).getByText('A person')).toBeInTheDocument()
  })

  it('lists no tier that charges', () => {
    renderWithIntl(<AiScreen />)
    expect(screen.getByText(/^There is no such tier, and no agent can start a charge. No assistant's tool takes an amount./)).toBeInTheDocument()
  })

  it('sends the reader to the published scorecard, with its counts', () => {
    renderWithIntl(<AiScreen />)
    expect(screen.getAllByRole('note').filter((note) => within(note).queryByText('Every figure is published with its count.') !== null)).toHaveLength(1)
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
  it('says the demo shop is open, with a one-tap sign-in and no code to wait for', () => {
    renderWithIntl(<DemoScreen />)
    const note = within(screen.getByRole('note'))
    expect(note.getByText('The demo shop is open.')).toBeInTheDocument()
    expect(note.getByText(/one tap/i)).toBeInTheDocument()
  })

  it('describes the three sample returns', () => {
    renderWithIntl(<DemoScreen />)
    for (const name of ['A clean return', 'A scratch', 'A contested claim']) {
      expect(screen.getByRole('heading', { level: 3, name })).toBeInTheDocument()
    }
  })

  it('keeps the contested hold whole until the claim is settled', () => {
    renderWithIntl(<DemoScreen />)
    expect(screen.getByText('Held until it is settled')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '€300 reserved, nothing taken' })).toBeInTheDocument()
  })

  it('labels what is simulated', () => {
    renderWithIntl(<DemoScreen />)
    expect(within(screen.getByRole('list', { name: 'Simulated' })).getAllByRole('listitem')).toHaveLength(3)
  })

  it('sends the reader on to sign in to the demo shop', () => {
    renderWithIntl(<DemoScreen />)
    expect(screen.getByRole('link', { name: 'Sign in to the demo shop' })).toHaveAttribute('href', '/sign-in')
  })
})

describe('PrivacyScreen', () => {
  it('says plainly that Hold is a hackathon build in PayPal’s sandbox, not a registered business', () => {
    renderWithIntl(<PrivacyScreen />)
    expect(screen.getByText(/runs in PayPal's sandbox, so no real money moves, and it is not a registered business/)).toBeInTheDocument()
  })

  it('states the periods the evidence bucket keeps, from the same constants', () => {
    renderWithIntl(<PrivacyScreen />)
    expect(screen.getByText(new RegExp(`for ${String(EVIDENCE_LOCK_DAYS)} days.*deleted ${String(EVIDENCE_KEPT_DAYS)} days after they were taken`))).toBeInTheDocument()
    expect(screen.getByText(`Kept for ${String(BACKUP_KEPT_DAYS)} days, so an erasure has left the backups ${String(BACKUP_KEPT_DAYS)} days after it.`)).toBeInTheDocument()
  })

  it('names everyone who handles the details for Hold', () => {
    renderWithIntl(<PrivacyScreen />)
    for (const name of ['Amazon Web Services', 'PayPal', 'Anthropic’s Claude, through Amazon Bedrock', 'Amazon Rekognition', 'Google, through Gmail', 'AWS End User Messaging', 'Expo']) {
      expect(screen.getByRole('heading', { level: 3, name })).toBeInTheDocument()
    }
  })

  it('says how to have details erased, and what stays', () => {
    renderWithIntl(<PrivacyScreen />)
    const erasure = screen.getByRole('heading', { level: 2, name: 'Having your details erased' }).closest('section')
    expect(erasure).toHaveTextContent(/its owner erases your name, email and phone number/)
    expect(erasure).toHaveTextContent(/The money log, approvals, the audit trail and the photographs stay/)
  })

  it('leads to the terms of use', () => {
    renderWithIntl(<PrivacyScreen />)
    expect(screen.getByRole('link', { name: /Read the terms of use/ })).toHaveAttribute('href', '/terms')
  })
})

describe('TermsScreen', () => {
  it('says there is no real money, and no warranty', () => {
    renderWithIntl(<TermsScreen />)
    expect(screen.getByRole('heading', { level: 3, name: 'Sandbox only' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'No warranty' })).toBeInTheDocument()
  })

  it('leads to the privacy notice', () => {
    renderWithIntl(<TermsScreen />)
    expect(screen.getByRole('link', { name: /Read the privacy notice/ })).toHaveAttribute('href', '/privacy')
  })
})

describe('the promise about photographs', () => {
  it('states the period the evidence is kept, on the renters’ page', () => {
    renderWithIntl(<ForRentersScreen />)
    expect(screen.getByText(new RegExp(`Photographs are deleted ${String(EVIDENCE_KEPT_DAYS)} days after they are taken`))).toBeInTheDocument()
  })
})

describe('AdvocatesScreen', () => {
  it('shows the recorded live run, move by move, with its chain of fingerprints', () => {
    renderWithIntl(<AdvocatesScreen />)
    expect(screen.getByRole('heading', { name: 'What the advocates said' })).toBeInTheDocument()
    expect(screen.getByText('Opened with the claim as presented: €50.00')).toBeInTheDocument()
    expect(screen.getByText(/no move was changed, removed or reordered/)).toBeInTheDocument()
  })

  it('names what the referee refuses, in plain code', () => {
    renderWithIntl(<AdvocatesScreen />)
    for (const name of ['No line added or dropped', 'Never above the published price', 'Every reduction names its ground', 'The gap only closes', 'Inside its own side’s limit', 'Bounded in moves and time']) {
      expect(screen.getByRole('heading', { level: 3, name })).toBeInTheDocument()
    }
  })

  it('offers a live run in a demo shop of the reader’s own', () => {
    renderWithIntl(<AdvocatesScreen />)
    expect(screen.getAllByRole('link', { name: 'Run them live in a demo shop' })[0]).toHaveAttribute('href', '/demo')
  })
})

describe('PaypalScreen', () => {
  it('shows the same hold settling an agreement, and links to the advocates', () => {
    renderWithIntl(<PaypalScreen />)
    expect(screen.getByRole('heading', { level: 2, name: 'When the two sides disagree, the same hold settles it.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See the advocates’ recorded run' })).toHaveAttribute('href', '/advocates')
  })
})
