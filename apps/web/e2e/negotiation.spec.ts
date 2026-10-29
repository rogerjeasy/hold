import type { Page } from '@playwright/test'
import { handedOverAndReturned, inspectedReturn } from './support/claim'
import { mcpClient } from './support/mcp'
import { expectFitsEveryWidth } from './support/responsive'
import { placeHold, renterBrowser } from './support/rental'
import { shopReadyToBook } from './support/shop'
import { TEST_CODE } from './support/sign-in'
import { expect, test } from './support/test'

// Extension 4 in the test environment: Hold's advocates are the simulated stand-in, which says so on every screen.

// The owner sets the shop advocate's limits once, in settings: half of a claim, on claims up to €200.
async function shopAdvocate(page: Page, checkWidths = false): Promise<void> {
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Contested claims' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Contested claims')
  await expect(page.getByRole('heading', { level: 2, name: 'Settlement advocate' })).toBeVisible()
  await expect(page.getByText('No shop advocate. Contested claims come to you, as now.')).toBeVisible()
  await page.getByLabel('Lowest share of a claim it may agree to, in percent').fill('50')
  await page.getByLabel('Largest claim it may take on, in EUR').fill('200')
  await page.getByRole('button', { name: 'Save the limits' }).click()
  await expect(page.getByText('Saved. They apply to the next contest.')).toBeVisible()
  await page.reload()
  await expect(page.getByText(/At least 50% of a claim, on claims up to €200.00/)).toBeVisible()
  if (checkWidths) await expectFitsEveryWidth(page)
}

// Staff raise and approve the claim as in the spine, on its claim page; the renter's link to it.
async function claimPresented(page: Page, claimPage: string): Promise<string> {
  await page.goto(claimPage)
  await page.getByLabel('What did you find, and why does this price apply?').fill('Fresh scratch on the frame, inspected in person; the sample comparison was deferred.')
  await page.getByRole('button', { name: 'Prepare claim for review', exact: true }).click()
  await page.getByRole('button', { name: 'Approve and show renter link', exact: true }).click()
  return (await page.getByTestId('renter-link').textContent()) ?? ''
}

// Both final taps: the renter's, with a fresh code, then the owner's. Then the spine captures the agreed amount.
async function bothConfirm(page: Page, renter: Page): Promise<void> {
  await renter.getByRole('button', { name: 'Email me a verification code' }).click()
  await expect(renter.getByText('Verification code sent. It expires in ten minutes.')).toBeVisible()
  await renter.getByLabel('Verification code', { exact: true }).fill(TEST_CODE)
  await renter.getByRole('button', { name: 'Confirm and settle' }).click()
  await expect(renter.getByText('You confirmed. Waiting for the shop to confirm.')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'What the advocates said' })).toBeVisible()
  await expectFitsEveryWidth(page)
  await page.getByRole('button', { name: 'Confirm and settle' }).click()
  await expect(page.getByText('Agreed on €17.50 and confirmed. The hold settles through PayPal.')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Settlement confirmed', { exact: true })).toBeVisible()
  await expect(page.getByText('€17.50').first()).toBeVisible()
}

test('two advocates settle a contested claim, both people confirm, and only the agreed amount is charged', async ({ page, browser }) => {
  test.setTimeout(300000)
  await inspectedReturn(page, browser, 'Porto Advocate Bikes')
  const claimPage = page.url()
  await shopAdvocate(page, true)
  const link = await claimPresented(page, claimPage)

  // The renter hands the contest to an advocate with the most they will pay, after their emailed code.
  const renter = await renterBrowser(browser)
  await renter.goto(link)
  await renter.getByRole('button', { name: 'I have reviewed this claim' }).click()
  await expect(renter.getByRole('heading', { name: 'Let an advocate argue it for me' })).toBeVisible()
  // No assistant is connected to this rental, so Hold's advocate argues it.
  await expect(renter.getByRole('group', { name: 'Who argues it for me' })).toHaveCount(0)
  await expectFitsEveryWidth(renter)
  await renter.getByRole('button', { name: 'Email me a verification code' }).click()
  await expect(renter.getByText('Verification code sent. It expires in ten minutes.')).toBeVisible()
  await renter.getByLabel('Verification code, for your advocate').fill(TEST_CODE)
  await renter.getByLabel('The most I will pay, in EUR').fill('30')
  await renter.getByRole('button', { name: 'Hand my contest to an advocate' }).click()
  // The claim is answered now: its page offers the advocate's page instead of the choices.
  await renter.getByRole('link', { name: 'See what the advocates said' }).click()
  await expect(renter.getByRole('heading', { level: 1 })).toHaveText('Your advocate')
  await expect(renter.getByText('Your highest total: €30.00. Only you see this.')).toBeVisible()
  await expect(renter.getByText(/Simulated advocates/)).toBeVisible()
  await expect(renter.getByText('The advocates agreed on €17.50. Nothing is charged until each person confirms.')).toBeVisible()
  await expectFitsEveryWidth(renter)

  await bothConfirm(page, renter)
  await expectFitsEveryWidth(page)
  await renter.context().close()
})

test('the renter’s own assistant argues the contest over MCP, held to the renter’s limit, and both people confirm', async ({ page, browser, playwright }) => {
  test.setTimeout(300000)
  const shopName = `Assistant Advocate Bikes ${String(Date.now()).slice(-6)}`
  await shopReadyToBook(page, shopName)
  await shopAdvocate(page)

  // The renter's own assistant books through Hold's MCP server, and the renter pays the fee in PayPal.
  const request = await playwright.request.newContext({ baseURL: new URL(page.url()).origin })
  const assistant = await mcpClient(request, 'Trip planner')
  const found = await assistant.call('find_shops', { place: shopName })
  const slug = String((found.data['shops'] as readonly Readonly<Record<string, unknown>>[])[0]?.['shop'])
  const day = (offset: number) => `${new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)}T10:00`
  const free = await assistant.call('check_availability', { shop: slug, starts_at: day(1), ends_at: day(3) })
  const itemType = String((free.data['item_types'] as readonly Readonly<Record<string, unknown>>[])[0]?.['item_type_id'])
  const quote = await assistant.call('quote_rental', { shop: slug, starts_at: day(1), ends_at: day(3), items: [{ item_type_id: itemType, count: 1 }] })
  const booking = await assistant.call('create_booking', { quote_id: quote.data['quote_id'] })
  const renter = await renterBrowser(browser)
  await renter.goto(String(booking.data['approval_url']))
  await renter.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(renter.getByText('Payment confirmed. Your rental is booked.')).toBeVisible()
  const paid = await assistant.call('get_booking', { booking_secret: booking.data['booking_secret'] })
  expect(paid.data).toMatchObject({ status: 'paid', token: 'issued_now' })
  const rental = { rental_id: String(paid.data['rental_id']), agent_token: String(paid.data['agent_token']) }

  // Staff hand the bike over and take it back, with the sample photographs, and present a claim.
  await page.goto(`/shop/rentals/${rental.rental_id}`)
  await placeHold(page, renter)
  await handedOverAndReturned(page)
  const link = await claimPresented(page, page.url())
  // Before the renter chooses it, the assistant has no negotiation scope.
  expect(await assistant.call('get_negotiation', rental)).toMatchObject({ isError: true, data: { error: 'not_authorized' } })

  // The renter chooses their own assistant as the advocate, with the most they will pay, after their emailed code.
  await renter.goto(link)
  await renter.getByRole('button', { name: 'I have reviewed this claim' }).click()
  const choice = renter.getByRole('group', { name: 'Who argues it for me' })
  await expect(choice).toBeVisible()
  await expectFitsEveryWidth(renter)
  await choice.getByRole('radio', { name: /My own assistant, Trip planner/ }).check()
  await renter.getByRole('button', { name: 'Email me a verification code' }).click()
  await expect(renter.getByText('Verification code sent. It expires in ten minutes.')).toBeVisible()
  await renter.getByLabel('Verification code, for your advocate').fill(TEST_CODE)
  await renter.getByLabel('The most I will pay, in EUR').fill('30')
  await renter.getByRole('button', { name: 'Hand my contest to an advocate' }).click()
  await renter.getByRole('link', { name: 'See what the advocates said' }).click()
  await expect(renter.getByText("Your own assistant argues your contest. Hold's advocate does not move for you, and every move passes Hold's referee.")).toBeVisible()

  // The assistant reads the evidence, sees the renter's limit and never the shop's, and makes its move.
  const negotiation = await assistant.call('get_negotiation', rental)
  expect(negotiation.data).toMatchObject({ state: 'open', your_turn: true, your_limit: { highest_total: { cents: 30_00, currency: 'EUR' } }, claim_total: { cents: 35_00 } })
  expect(JSON.stringify(negotiation.data)).not.toMatch(/lowest|largest|"1750"|20000/)
  const lines = (await assistant.call('get_claim_lines', rental)).data['lines'] as readonly Readonly<Record<string, unknown>>[]
  const prices = await assistant.call('get_price_list', rental)
  const clause = String((prices.data['wear_policy_clauses'] as readonly Readonly<Record<string, unknown>>[])[0]?.['id'])
  const lineId = String(lines[0]?.['line_id'])
  // Past the renter's own limit, the referee refuses it, and tells only the assistant why.
  expect((await assistant.call('submit_offer', { ...rental, move: 'offer', lines: [{ line_id: lineId, cents: 35_00, ground: null, evidence: [] }] })).data).toMatchObject({ outcome: 'refused', next: 'your_move' })
  const moved = await assistant.call('submit_offer', { ...rental, move: 'offer', lines: [{ line_id: lineId, cents: 17_50, ground: 'ordinary_wear', evidence: [clause] }] })
  // The shop's advocate accepts at its lowest share; nothing is charged until both people confirm.
  expect(moved.data).toMatchObject({ outcome: 'accepted', state: 'agreed', next: 'the_person_confirms_on_their_rental_link' })

  await renter.reload()
  await expect(renter.getByText('The advocates agreed on €17.50. Nothing is charged until each person confirms.')).toBeVisible()
  await expect(renter.getByText(/The renter's own assistant/)).toBeVisible()
  await expectFitsEveryWidth(renter)
  await bothConfirm(page, renter)
  await request.dispose()
  await renter.context().close()
})
