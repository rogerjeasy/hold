import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { AiBoundaries } from './ai-boundaries'
import { AudienceDoors } from './audience-doors'
import { AudiencePanels } from './audience-panels'
import { CapabilityTable } from './capability-table'
import { ClosingCall } from './closing-call'
import { FeatureGrid } from './feature-grid'
import { Hero } from './hero'
import { Notice } from '@/components/ui/notice'
import { PageIntro } from './page-intro'
import { StepList } from './step-list'

describe('Hero', () => {
  it('leads with the one claim the page makes', () => {
    renderWithIntl(<Hero />)
    expect(screen.getByRole('heading', { level: 1, name: 'One photograph settles it.' })).toBeInTheDocument()
  })
})

describe('AudienceDoors', () => {
  it('sends shops to the demo and renters to their page', () => {
    renderWithIntl(<AudienceDoors />)
    expect(screen.getByRole('link', { name: 'For shops Open the demo shop' })).toHaveAttribute('href', '/demo')
    expect(screen.getByRole('link', { name: "For renters See the renter's view" })).toHaveAttribute('href', '/for-renters')
  })
})

describe('StepList', () => {
  it('walks through the rental in order', () => {
    renderWithIntl(<StepList />)
    const steps = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(steps.map((step) => within(step).getByRole('heading').textContent)).toEqual([
      'Reserve',
      'Hand over',
      'Return',
      'Settle',
    ])
  })

  it('shows what each moment leaves behind', () => {
    renderWithIntl(<StepList />)
    for (const state of ['€300 reserved', '6 photographs', '6 pairs compared', '€35 taken · €265 released']) {
      expect(screen.getByText(state)).toBeInTheDocument()
    }
  })
})

describe('AudiencePanels', () => {
  it('gives shops four reasons and the demo', () => {
    renderWithIntl(<AudiencePanels />)
    const panel = within(screen.getByRole('region', { name: 'For shops' }))
    expect(panel.getAllByRole('listitem')).toHaveLength(4)
    expect(panel.getByRole('link', { name: 'Open the demo shop' })).toHaveAttribute('href', '/demo')
    expect(panel.getByAltText("Rental bicycles stored on racks in a shop's back room")).toBeInTheDocument()
  })

  it('gives renters four reasons and their own page', () => {
    renderWithIntl(<AudiencePanels />)
    const panel = within(screen.getByRole('region', { name: 'For renters' }))
    expect(panel.getAllByRole('listitem')).toHaveLength(4)
    expect(panel.getByRole('link', { name: "See the renter's view" })).toHaveAttribute('href', '/for-renters')
  })
})

describe('AiBoundaries', () => {
  it('sets what the AI does beside what it never does', () => {
    renderWithIntl(<AiBoundaries />)
    const does = within(screen.getByRole('list', { name: 'What the AI does' }))
    const never = within(screen.getByRole('list', { name: 'What it never does' }))
    expect(does.getAllByRole('listitem')).toHaveLength(4)
    expect(never.getAllByRole('listitem')).toHaveLength(4)
    expect(never.getByText('Decide to charge anyone. A person does.')).toBeInTheDocument()
  })
})

describe('CapabilityTable', () => {
  it('pairs each rental need with the PayPal capability that meets it', () => {
    renderWithIntl(<CapabilityTable rows={['hold', 'release']} />)
    const table = within(screen.getByRole('table', { name: 'What each rental need uses in PayPal' }))
    expect(table.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Rental need', 'PayPal capability'])
    expect(table.getByRole('row', { name: 'The deposit is reserved without being charged Authorization hold' })).toBeInTheDocument()
    expect(table.getAllByRole('row')).toHaveLength(3)
  })

  it('says the build runs on test money', () => {
    renderWithIntl(<CapabilityTable rows={['hold']} />)
    expect(screen.getByText('This build runs in the PayPal sandbox with test money.')).toBeInTheDocument()
  })
})

describe('ClosingCall', () => {
  it('ends on the invitation and both doors', () => {
    renderWithIntl(<ClosingCall />)
    expect(screen.getByRole('heading', { level: 2, name: 'Try a return yourself.' })).toBeInTheDocument()
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/demo', '/for-renters'])
  })
})

describe('PageIntro', () => {
  it('opens a page with its one top heading and lead', () => {
    renderWithIntl(<PageIntro title="Keep your money while you rent." lead="A hold reserves the deposit." />)
    expect(screen.getByRole('heading', { level: 1, name: 'Keep your money while you rent.' })).toBeInTheDocument()
    expect(screen.getByText('A hold reserves the deposit.')).toBeInTheDocument()
  })

  it('carries an action when the page has one', () => {
    renderWithIntl(<PageIntro title="T" lead="L" action={{ href: '/demo', label: 'Open the demo shop' }} />)
    expect(screen.getByRole('link', { name: 'Open the demo shop' })).toHaveAttribute('href', '/demo')
  })

  it('shows a photograph with its description when given one', () => {
    renderWithIntl(<PageIntro title="T" lead="L" image={{ src: '/images/shop.jpg', alt: 'Bikes on racks' }} />)
    expect(screen.getByAltText('Bikes on racks')).toBeInTheDocument()
  })
})

describe('FeatureGrid', () => {
  it('lists each item under its own heading', () => {
    renderWithIntl(
      <FeatureGrid
        items={[
          { title: 'A clean return', body: 'The hold is released.' },
          { title: 'A scratch', body: 'Charged in part.' },
        ]}
      />,
    )
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0] as HTMLElement).getByRole('heading', { level: 3, name: 'A clean return' })).toBeInTheDocument()
    expect(within(items[1] as HTMLElement).getByText('Charged in part.')).toBeInTheDocument()
  })
})

describe('Notice', () => {
  it('states a status in words a screen reader announces as a note', () => {
    renderWithIntl(<Notice title="The demo shop is not open yet." body="It opens when the first build is deployed." />)
    const note = within(screen.getByRole('note'))
    expect(note.getByText('The demo shop is not open yet.')).toBeInTheDocument()
    expect(note.getByText('It opens when the first build is deployed.')).toBeInTheDocument()
  })
})
