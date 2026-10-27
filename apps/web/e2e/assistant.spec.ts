import { expectFitsEveryWidth } from './support/responsive'
import { renterBrowser } from './support/rental'
import { shopReadyToBook } from './support/shop'
import { expect, test } from './support/test'

// Renting through an assistant (extensions.md section 8): the hosted assistant, a client of the app's own /mcp, books
// at a shop; the person approves the fee in the simulated PayPal; the assistant receives its token; the renter sees it
// on their link, reads what it did and disconnects it; staff see who booked.

test('a judge rents through the hosted assistant, approves the fee in PayPal, and the renter sees and disconnects it', async ({ page, browser }) => {
  const shopName = `Assistant Bikes ${String(Date.now()).slice(-6)}`
  await shopReadyToBook(page, shopName)

  const judge = await renterBrowser(browser)
  await judge.goto('/assistant')
  await expect(judge.getByRole('heading', { level: 1 })).toHaveText('Rent through an assistant')
  const send = async (text: string) => {
    await judge.getByLabel('Your message').fill(text)
    await judge.getByRole('button', { name: 'Send' }).click()
  }
  await send(`Book me an e-bike for three days at ${shopName}.`)
  // Copied from Hold's quote: three days at €45.00, and the €300.00 hold.
  await expect(judge.getByText(/for 3 days for €135\.00\. At pickup PayPal holds €300\.00/)).toBeVisible()
  await expect(judge.getByText('Simulated: a script, not Claude').first()).toBeVisible()
  await expect(judge.getByText('Used quote_rental')).toBeVisible()

  await send('Yes, book it.')
  const approve = judge.getByRole('link', { name: 'Approve the fee in PayPal' })
  await expect(approve).toBeVisible()
  await expect(judge.getByRole('img', { name: 'Scan to approve the fee on your phone' })).toBeVisible()
  await expectFitsEveryWidth(judge)

  // The person approves on their own phone, in PayPal's page, and PayPal returns them to their rental link.
  const renter = await renterBrowser(browser)
  await renter.goto((await approve.getAttribute('href')) ?? '')
  await expect(renter.getByText('Test environment. No money moves.', { exact: false })).toBeVisible()
  await renter.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(renter.getByText('Payment confirmed. Your rental is booked.')).toBeVisible()
  await renter.getByRole('link', { name: 'See your rental' }).click()
  await expect(renter.getByText('An assistant made this booking')).toBeVisible()

  await send('I approved it in PayPal.')
  await expect(judge.getByText(/your rental is booked/)).toBeVisible()

  await renter.reload()
  await expect(renter.getByText('An assistant is connected to this rental')).toBeVisible()
  await renter.getByRole('link', { name: 'See what it did, or disconnect it' }).click()
  await expect(renter.getByRole('heading', { level: 1 })).toHaveText('An assistant is connected to this rental')
  await expect(renter.getByText('Hold hosted assistant (demonstration)')).toBeVisible()
  const did = renter.getByRole('list', { name: 'What it did' })
  await expect(did).toContainText('Made this booking')
  await expect(did).toContainText('Checked whether the fee was paid')
  await expectFitsEveryWidth(renter)
  await renter.getByRole('button', { name: 'Disconnect the assistant' }).click()
  await expect(renter.getByText('Disconnected. Its next call will be refused.')).toBeVisible()
  await renter.reload()
  await expect(renter.getByRole('heading', { level: 1 })).toHaveText('The assistant was disconnected')

  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Rentals' }).click()
  await expect(page.getByText("Booked by the renter's assistant")).toBeVisible()
  await judge.context().close()
  await renter.context().close()
})
