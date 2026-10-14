import type { Page } from '@playwright/test'

// A passkey device inside the test browser, through Chrome's DevTools protocol. It answers every WebAuthn prompt as
// a phone would after the person's fingerprint, so passkey flows run with no person present.
export async function addVirtualAuthenticator(page: Page): Promise<void> {
  const session = await page.context().newCDPSession(page)
  await session.send('WebAuthn.enable')
  await session.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  })
}
