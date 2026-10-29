import { expectFitsEveryWidth } from './support/responsive'
import { readyForHandover, renterBrowser } from './support/rental'
import { expect, test } from './support/test'

// A return with nobody at the counter (architecture.md section 6.13): the owner opens it, the renter photographs the
// e-bike through their link and leaves it at the drop point, and a person checks it the next morning. Nothing is charged
// before that person acts.
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } })

const DROP_POINT = 'The locked rack to the left of the shop door. Lock it with the code on its tag.'

test('a renter returns the item at the drop point, and a person checks it before anything else happens', async ({ page, browser }) => {
  test.setTimeout(300_000)
  await readyForHandover(page, browser, 'Porto After Hours Bikes')
  const rental = page.url()
  await page.getByRole('region', { name: 'Handover' }).getByRole('button', { name: /^Photograph / }).click()
  await expect(page).toHaveURL(/\/handover\/[0-9a-f-]{36}$/)
  const views = page.getByRole('list', { name: 'Views' })
  await expect(views).toBeVisible()
  const needed = await views.getByText('Needed').count()
  for (let count = 1; count <= needed; count += 1) {
    await page.getByRole('button', { name: 'Use the sample photograph' }).click()
    await expect(views.getByText('Photographed')).toHaveCount(count, { timeout: 30_000 })
  }
  await page.getByRole('button', { name: 'Seal the photographs' }).click()
  await expect(page.getByText('The rental is out.')).toBeVisible()

  // The owner opens returns after hours, with hours that leave the shop closed now.
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Returns after hours' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Returns after hours')
  await page.getByRole('checkbox', { name: 'Let renters return items themselves' }).check()
  await page.getByLabel('Where renters leave items').fill(DROP_POINT)
  await page.getByLabel('Opens').fill('00:00')
  await page.getByLabel('Closes').fill('00:01')
  await expect(page.getByRole('complementary', { name: 'What renters see' })).toContainText(DROP_POINT)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Let renters return items themselves' })).toBeChecked()
  await expectFitsEveryWidth(page)

  await page.goto(rental)
  await page.getByRole('button', { name: 'Show the link' }).click()
  const link = (await page.getByTestId('renter-link').textContent()) ?? ''
  const renter = await renterBrowser(browser)
  await renter.goto(link)
  await expect(renter.getByRole('heading', { name: 'The shop is closed. You can still return it.' })).toBeVisible()
  await renter.getByRole('link', { name: 'Return it myself' }).click()
  await expect(renter.getByRole('heading', { level: 1 })).toHaveText('Before you start')
  await expect(renter.getByText(DROP_POINT)).toBeVisible()
  await expect(renter.getByText('Nothing is charged now.')).toBeVisible()
  await expectFitsEveryWidth(renter)
  await renter.getByRole('button', { name: 'Start the photographs' }).click()
  await expect(renter.getByRole('heading', { level: 1 })).toHaveText('Photograph the return')
  const renterViews = renter.getByRole('list', { name: 'Views' })
  await expect(renterViews).toBeVisible()
  const toTake = await renterViews.getByText('Needed').count()
  expect(toTake).toBeGreaterThan(1)
  await expect(renter.getByRole('button', { name: 'Send my return' })).toBeDisabled()
  for (let count = 1; count <= toTake; count += 1) {
    const current = renter.getByRole('button', { name: 'Use the sample with damage' })
    await ((await current.count()) > 0 ? current : renter.getByRole('button', { name: 'Use the sample photograph' })).click()
    await expect(renterViews.getByText('Photographed')).toHaveCount(count, { timeout: 30_000 })
  }
  await expectFitsEveryWidth(renter)
  await renter.getByRole('button', { name: 'Send my return' }).click()
  await expect(renter.getByRole('heading', { level: 1 })).toHaveText('Your return')
  await expect(renter.getByText('Returned on time')).toBeVisible()
  await expect(renter.getByText('Reserved, not taken')).toBeVisible()
  await expect(renter.getByText(/^Checked with PayPal at /)).toBeVisible()
  await expect(renter.getByText('A person checks it')).toBeVisible()
  await expectFitsEveryWidth(renter)

  // The next morning: the item waits at the top of the queue, and only a person makes it returned.
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Morning queue' }).click()
  const waiting = page.getByRole('article', { name: /^City e-bike/ })
  await expect(waiting).toContainText('Returned by the renter')
  await expect(waiting).toContainText('Hold €300.00 reserved')
  await expect(waiting.getByRole('img', { name: 'Where they left it' })).toBeVisible()
  await expectFitsEveryWidth(page)
  await waiting.getByRole('button', { name: 'It’s here, review the return' }).click()
  await expect(page).toHaveURL(/\/shop\/rentals\/[0-9a-f-]{36}\/claim$/)

  await renter.reload()
  await expect(renter.getByText('Porto After Hours Bikes checked it')).toBeVisible()
  await renter.context().close()
})
