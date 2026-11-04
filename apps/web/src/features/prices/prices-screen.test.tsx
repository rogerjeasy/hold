import type { PriceListVersion, PublishedPriceList } from '@hold/db'
import { act, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import de from '../../../messages/de.json'
import en from '../../../messages/en.json'
import es from '../../../messages/es.json'
import fr from '../../../messages/fr.json'
import type { PriceGridProps } from './price-grid'
import { PricesScreen } from './prices-screen'
import type { PricesScreenProps } from './prices-screen'

// The price list editor (extensions.md section 12.5) as an owner uses it. The grid needs a browser's layout and is
// checked end to end; here it is a stand-in that lists the draft's rows as it was given them.
vi.mock('./price-grid', () => ({
  PriceGrid: ({ rows }: PriceGridProps) => <ul aria-label="Grid stand-in">{rows.map((row) => <li key={row.key}>{`${row.description} | ${row.category} | ${row.amount}`}</li>)}</ul>,
}))
vi.mock('@/features/shop/actions', () => ({ publishPrices: vi.fn() }))
vi.mock('@/features/auth/passkey-button', () => ({ PasskeyButton: ({ label }: { label: string }) => <button type="button">{label}</button> }))

const terms = (messages: typeof en) => ({ prices: messages.renter.prices, pricesLead: messages.renter.pricesLead, wear: messages.renter.wear, wearLead: messages.renter.wearLead })
const current: PublishedPriceList = {
  version: 1, currency: 'EUR', publishedAt: new Date('2026-10-01T10:00:00Z'), wearPolicy: 'Scuffs on tyres are wear.',
  entries: [{ id: 'e1', code: 'deep-scratch-on-the-frame', description: 'Deep scratch on the frame', category: 'damage', amountCents: 35_00 }],
}
const versions: PriceListVersion[] = [{ version: 1, currency: 'EUR', publishedAt: current.publishedAt, wearPolicy: current.wearPolicy, liveRentals: 9, entries: [{ description: 'Deep scratch on the frame', category: 'damage', amountCents: 35_00 }] }]

const props = (overrides: Partial<PricesScreenProps> = {}): PricesScreenProps => ({
  shopName: 'Ribeira Bikes', shopId: 'shop-1', current, versions, fixedCurrency: 'EUR', threshold: '', canPublish: true,
  gate: { needed: false, hasPasskey: true, email: 'owner@example.com' },
  previewTerms: { en: terms(en), de: terms(de), es: terms(es), fr: terms(fr) },
  ...overrides,
})

const grid = () => within(screen.getByRole('list', { name: 'Grid stand-in' })).getAllByRole('listitem').map((item) => item.textContent)

async function paste(text: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Paste from a spreadsheet' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Paste your price list here' }), { target: { value: text } })
  await user.click(screen.getByRole('button', { name: 'Add these prices' }))
  return user
}

describe('the price list editor', () => {
  it('starts from the version in force as a draft of the next one', () => {
    renderWithIntl(<PricesScreen {...props()} />)
    expect(screen.getByText('Draft of version 2')).toBeInTheDocument()
    expect(grid()).toEqual(['Deep scratch on the frame | damage | 35.00'])
    expect(screen.getByTestId('draft-status')).toHaveTextContent('Ready to publish.')
  })

  it('adds a price list pasted from a spreadsheet, leaving out its header, and checks every cell', async () => {
    renderWithIntl(<PricesScreen {...props()} />)
    await paste('What\tKind\tPrice\nLost lock\tLoss\t45\nBent wheel\tDamage\tninety')
    expect(screen.getByText('2 prices added, the header line left out.')).toBeInTheDocument()
    expect(grid()).toEqual(['Deep scratch on the frame | damage | 35.00', 'Lost lock | loss | 45', 'Bent wheel | damage | ninety'])
    expect(screen.getByTestId('draft-status')).toHaveTextContent('1 cell to fix before publishing.')
    expect(screen.getByRole('button', { name: 'Publish this price list' })).toBeDisabled()
  })

  it('takes a paste back and puts it back again', async () => {
    renderWithIntl(<PricesScreen {...props()} />)
    const user = await paste('Lost lock\t45')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(grid()).toEqual(['Deep scratch on the frame | damage | 35.00'])
    await user.click(screen.getByRole('button', { name: 'Redo' }))
    expect(grid()).toHaveLength(2)
  })

  it('on a phone, names the problem beside the cell that has it, in the shop’s currency', async () => {
    const user = userEvent.setup()
    renderWithIntl(<PricesScreen {...props()} />)
    const amount = screen.getByRole('textbox', { name: 'Amount, in EUR' })
    await user.clear(amount)
    await user.type(amount, '3 5')
    await user.tab()
    expect(screen.getByText('Not an amount in EUR')).toBeInTheDocument()
  })

  it('shows the draft as a renter reads it, in the renter’s language', async () => {
    const user = userEvent.setup()
    renderWithIntl(<PricesScreen {...props()} />)
    const preview = screen.getByRole('region', { name: 'What a renter reads' })
    expect(within(preview).getByText('Deep scratch on the frame')).toBeInTheDocument()
    expect(within(preview).getByText('€35.00')).toBeInTheDocument()
    await user.selectOptions(within(preview).getByRole('combobox', { name: 'Renter’s language' }), 'de')
    expect(within(preview).getByRole('heading', { name: de.renter.prices })).toBeInTheDocument()
  })

  it('lists each version with the open rentals agreed to it, and shows what the draft would change', async () => {
    renderWithIntl(<PricesScreen {...props()} />)
    const versionsPart = screen.getByRole('region', { name: 'Versions' })
    expect(within(versionsPart).getByText('9 open rentals agreed to it')).toBeInTheDocument()
    const user = userEvent.setup()
    const amount = screen.getByRole('textbox', { name: 'Amount, in EUR' })
    await user.clear(amount)
    await user.type(amount, '40')
    await user.tab()
    await paste('Lost lock\tloss\t45')
    const diff = screen.getByRole('region', { name: 'What changed' })
    expect(within(diff).getByText(/^Deep scratch on the frame/)).toHaveTextContent('from €35.00 to €40.00')
    expect(within(diff).getByRole('heading', { name: 'Added' })).toBeInTheDocument()
    expect(within(diff).getByText('The wear policy is the same.')).toBeInTheDocument()
  })

  it('sends the draft to be published, every price as a field of the form', () => {
    renderWithIntl(<PricesScreen {...props()} />)
    const form = screen.getByRole('button', { name: 'Publish this price list' }).closest('form')
    if (form === null) throw new Error('No form.')
    const data = new FormData(form)
    expect(data.getAll('description')).toEqual(['Deep scratch on the frame'])
    expect(data.getAll('amount')).toEqual(['35.00'])
    expect(data.get('wearPolicy')).toBe('Scuffs on tyres are wear.')
  })

  // Counter staff quote prices to renters, so they read the list in force, not only the changes between versions (JW-M4).
  it('shows counter staff the prices in force to quote from, and no editor', () => {
    renderWithIntl(<PricesScreen {...props({ canPublish: false })} />)
    const inForce = screen.getByRole('region', { name: 'The prices in force' })
    expect(within(inForce).getByText('Deep scratch on the frame')).toBeInTheDocument()
    expect(within(inForce).getByText('€35.00')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'What counts as ordinary wear' })).getByText('Scuffs on tyres are wear.')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'What changed' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Publish this price list' })).not.toBeInTheDocument()
  })

  it('brings back a draft left unpublished in this browser', () => {
    localStorage.setItem('hold.priceDraft.shop-1', JSON.stringify({ baseVersion: 1, draft: { rows: [{ key: 0, description: 'Cracked display', category: 'damage', amount: '80' }], wearPolicy: 'Scuffs are wear.' } }))
    renderWithIntl(<PricesScreen {...props()} />)
    act(() => undefined)
    expect(screen.getByText('Your unsaved draft was restored from this browser.')).toBeInTheDocument()
    expect(grid()).toEqual(['Cracked display | damage | 80'])
  })
})
