import { expect, test } from './support/test'

// The home page's stage: a muted film behind the claim, the cut framed for the screen, and a control to stop it.
// Every other test asks for less motion (playwright.config.ts), so these two ask for none.
test.describe('with motion allowed', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } })

  test('the hero’s film plays behind the claim, and stops when asked', async ({ page }) => {
    await page.goto('/')
    const film = page.locator('section video')
    await expect.poll(() => film.evaluate((video: HTMLVideoElement) => !video.paused && video.readyState >= 2)).toBe(true)
    expect(await film.evaluate((video: HTMLVideoElement) => video.currentSrc.endsWith('/video/hero-wide.mp4'))).toBe(true)
    await page.getByRole('button', { name: 'Pause the background film' }).click()
    await expect.poll(() => film.evaluate((video: HTMLVideoElement) => video.paused)).toBe(true)
    await page.getByRole('button', { name: 'Play the background film' }).click()
    await expect.poll(() => film.evaluate((video: HTMLVideoElement) => video.paused)).toBe(false)
  })

  test('How it works plays its own film of the booking and the four moments, and a chapter plays it from there', async ({ page }) => {
    await page.goto('/how-it-works')
    const film = page.locator('section video')
    await expect.poll(() => film.evaluate((video: HTMLVideoElement) => !video.paused && video.currentSrc.endsWith('/video/how-wide.mp4'))).toBe(true)
    await expect(page.getByRole('button', { name: 'Play the film from Book' })).toHaveAttribute('aria-current', 'step')
    await page.getByRole('button', { name: 'Play the film from Settle' }).click()
    await expect.poll(() => film.evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThanOrEqual(26.2)
    await expect(page.getByRole('button', { name: 'Play the film from Settle' })).toHaveAttribute('aria-current', 'step')
  })

  test('a phone gets the film cut for a tall screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await expect.poll(() => page.locator('section video').evaluate((video: HTMLVideoElement) => video.currentSrc)).toMatch(/\/video\/hero-tall\.mp4$/)
  })
})

test('with less motion asked for, the stage shows one still frame and no film', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'One photograph settles it.' })).toBeVisible()
  await expect(page.locator('section img[src="/images/hero/hero-wide-still.webp"]')).toHaveCount(1)
  await expect(page.locator('section video')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Pause the background film' })).toHaveCount(0)
})
