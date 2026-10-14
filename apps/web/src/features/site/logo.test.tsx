import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { Logo } from './logo'

describe('Logo', () => {
  it('is read out as the site name, once', () => {
    renderWithIntl(<Logo />)
    expect(screen.getByRole('img', { name: 'Hold' })).toBeInTheDocument()
  })

  it('spells the name in lowercase, so the o is round', () => {
    renderWithIntl(<Logo />)
    expect(screen.getByRole('img', { name: 'Hold' })).toHaveTextContent(/^hold$/)
  })

  it('draws no symbol beside the word', () => {
    const { container } = renderWithIntl(<Logo />)
    expect(container.querySelector('svg')).toBeNull()
  })
})
