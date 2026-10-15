import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { ActionMessage } from './action-message'

describe('what a shop action answered', () => {
  it('words a refusal in the feature’s own words, naming the row', () => {
    renderWithIntl(<ActionMessage result={{ ok: false, failure: 'refused', reason: 'view_label_missing:1' }} success="" results="shop.items.results" />)
    expect(screen.getByRole('alert')).toHaveTextContent('View 2 needs a label.')
  })

  it('words a refusal the feature shares with every shop page in the shared words', () => {
    renderWithIntl(<ActionMessage result={{ ok: false, failure: 'passkey_needed' }} success="" results="shop.items.results" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Confirm with your passkey first.')
  })

  it('prefers the feature’s words where both have the reason', () => {
    renderWithIntl(<ActionMessage result={{ ok: false, failure: 'refused', reason: 'currency_unset' }} success="" results="shop.items.results" />)
    expect(screen.getByRole('alert')).toHaveTextContent('It sets the currency of every hold and day rate.')
  })
})
