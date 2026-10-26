import { createLocalSigner, issueCredential } from '@hold/trust'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { CredentialCheck } from './credential-check'

const record = { clean: 5, settled: 1, unpaid: 0, open: 0, shops: 2, windowMonths: 24 }
const renterKey = 'k'.repeat(43)

afterEach(() => {
  window.location.hash = ''
})

describe('checking a credential in the browser', () => {
  it('checks the credential the code’s address carries after the #, with the published key, and shows the counts', async () => {
    const signer = createLocalSigner()
    window.location.hash = await issueCredential(signer, renterKey, record, new Date())
    renderWithIntl(<CredentialCheck keys={[await signer.publicKey()]} timeZone="UTC" />)
    expect(await screen.findByText(/Signed by Hold\. Valid until/)).toBeInTheDocument()
    expect(screen.getByText('Returned in good condition').nextSibling).toHaveTextContent('5')
  })

  it('refuses a credential changed after Hold signed it', async () => {
    const signer = createLocalSigner()
    const [header, , signature] = (await issueCredential(signer, renterKey, record, new Date())).split('.')
    const forged = `${header ?? ''}.${btoa(JSON.stringify({ iss: 'hold', sub: renterKey, iat: 1, exp: 9_999_999_999, rec: { clean: 50, settled: 0, unpaid: 0, open: 0, shops: 9, window_months: 24 } })).replace(/=+$/, '')}.${signature ?? ''}`
    renderWithIntl(<CredentialCheck keys={[await signer.publicKey()]} timeZone="UTC" />)
    await userEvent.type(screen.getByLabelText('Credential'), forged)
    await userEvent.click(screen.getByRole('button', { name: 'Check' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This credential was changed after Hold signed it.')
    expect(screen.queryByText('Returned in good condition')).not.toBeInTheDocument()
  })

  it('refuses one signed by another key', async () => {
    const other = createLocalSigner()
    renderWithIntl(<CredentialCheck keys={[await createLocalSigner().publicKey()]} timeZone="UTC" />)
    await userEvent.type(screen.getByLabelText('Credential'), await issueCredential(other, renterKey, record, new Date()))
    await userEvent.click(screen.getByRole('button', { name: 'Check' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("This credential was not signed with Hold's key.")
  })
})
