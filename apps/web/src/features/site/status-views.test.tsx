import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { ErrorView } from './error-view'
import { NotFoundView } from './not-found-view'

describe('NotFoundView', () => {
  it('says the page does not exist and offers the way home', () => {
    renderWithIntl(<NotFoundView />)
    expect(screen.getByRole('heading', { level: 1, name: 'This page does not exist.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the home page' })).toHaveAttribute('href', '/')
  })
})

describe('ErrorView', () => {
  it('says what failed and that nothing was charged', () => {
    renderWithIntl(<ErrorView onRetry={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Something went wrong.' })).toBeInTheDocument()
    expect(screen.getByText(/Nothing was charged and nothing was changed\./)).toBeInTheDocument()
  })

  it('lets the reader try again', async () => {
    const onRetry = vi.fn()
    renderWithIntl(<ErrorView onRetry={onRetry} />)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
