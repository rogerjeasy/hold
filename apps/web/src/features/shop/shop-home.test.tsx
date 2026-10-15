import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { NoShop } from './shop-home'

describe('NoShop', () => {
  it('tells a person with no shop how to get one', () => {
    renderWithIntl(<NoShop person={undefined} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('No shop yet.')
    expect(screen.getByText(/Create one on the sign-up page/)).toBeInTheDocument()
  })
})
