import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { PromiseSettingsSection } from './promise-settings'

vi.mock('./actions', () => ({ savePromiseDays: vi.fn(), grantPromiseWaiver: vi.fn(), revokePromiseWaiver: vi.fn() }))

describe('the shop’s promise to renters, in settings', () => {
  it('lets the owner set the days, shows what renters read, and turns the waiver rule on', () => {
    renderWithIntl(<PromiseSettingsSection shopName="Alpine Rentals" days={3} waiver={null} canEdit />)
    expect(screen.getByRole('heading', { level: 2, name: 'Our promise to renters' })).toBeInTheDocument()
    expect(screen.getByLabelText('Days to decide a contested claim (1 to 14)')).toHaveValue(3)
    expect(screen.getByText(/Alpine Rentals promises to decide within 3 days of your reply/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Waive what we do not decide in time' })).toBeInTheDocument()
    expect(screen.getByText('Off. A claim not decided in time goes to the owner.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeInTheDocument()
  })

  it('shows a live waiver rule with its limits and a way to turn it off', () => {
    renderWithIntl(<PromiseSettingsSection shopName="Alpine Rentals" days={5} waiver={{ validUntil: new Date('2026-12-31T12:00:00Z'), dailyCount: 4 }} canEdit />)
    expect(screen.getByText(/On until .*, for up to 4 claims a day\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeInTheDocument()
  })

  it('tells everyone else what the shop promises, with no form', () => {
    renderWithIntl(<PromiseSettingsSection shopName="Alpine Rentals" days={3} waiver={null} canEdit={false} />)
    expect(screen.getByText('The shop promises to decide a contested claim within 3 days. Only the owner changes it.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save the promise' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn on' })).not.toBeInTheDocument()
  })
})
