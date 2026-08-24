import { expect, test, type Page } from '@playwright/test'

/**
 * The settling-up flow, end to end against the real API: a trip is created on
 * the server, the payment link is read-only, and marking someone paid there is
 * visible to whoever is collecting.
 */

async function stubPrice(page: Page) {
  await page.route('**/api/pricing/local**', (route) =>
    route.fulfill({ json: { price: null, country: null, reason: 'unknown-country' } }),
  )
}

async function openDemoAtCollect(page: Page) {
  await stubPrice(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Open the example trip' }).click()
  await expect(page.getByRole('heading', { name: 'Where the car went' })).toBeVisible()
  await page.getByRole('button', { name: 'Collect' }).click()
  await expect(page.getByRole('heading', { name: 'Getting it back' })).toBeVisible()
}

/** The payment link, read out of the clipboard the way a person would paste it. */
async function paymentLink(page: Page): Promise<string> {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: 'Copy the payment link' }).click()
  return page.evaluate(() => navigator.clipboard.readText())
}

/** Autosave is debounced; edits are not on the server until it has run. */
async function waitForSave(page: Page) {
  await page.waitForResponse(
    (response) => response.url().includes('/api/trips/') && response.request().method() === 'PUT',
  )
}

test('a trip is saved on the server, so it survives the browser forgetting nothing', async ({ page }) => {
  await openDemoAtCollect(page)
  const link = await paymentLink(page)
  expect(link).toMatch(/\/view\/[^#]+#[0-9a-f]{32}$/)
})

test('the Revolut handle builds a payment link per person', async ({ page }) => {
  await openDemoAtCollect(page)

  await page.getByLabel('Your Revolut handle').fill('https://revolut.me/mattsivak')
  await expect(page.getByRole('link', { name: /Open https:\/\/revolut\.me\/mattsivak/ })).toBeVisible()

  // Terka owes 804 Kč on the example trip.
  const pay = page.getByRole('link', { name: 'Pay 804 Kč' })
  await expect(pay).toHaveAttribute('href', 'https://revolut.me/mattsivak/804czk')
})

test('a bad handle is refused rather than turned into a broken link', async ({ page }) => {
  await openDemoAtCollect(page)
  await page.getByLabel('Your Revolut handle').fill('not a handle')

  await expect(page.getByText('That does not look like a Revolut handle')).toBeVisible()
  await expect(page.getByRole('link', { name: /^Pay / })).toHaveCount(0)
})

test('the payment link shows amounts and the working, and cannot edit the trip', async ({ page }) => {
  await openDemoAtCollect(page)
  await page.getByLabel('Your Revolut handle').fill('mattsivak')
  await waitForSave(page)
  const link = await paymentLink(page)

  await page.goto(link)
  await expect(page.getByRole('heading', { name: 'Volkswagen August trip' })).toBeVisible()
  await expect(page.getByText('read-only view of someone else')).toBeVisible()

  // None of the wizard is reachable from here.
  await expect(page.getByRole('button', { name: 'Route' })).toHaveCount(0)
  await expect(page.getByLabel('Distance km')).toHaveCount(0)

  await expect(page.getByRole('link', { name: 'Pay 804 Kč' })).toBeVisible()

  await page.getByRole('group', { name: 'Colour theme' }).waitFor()
  await page.getByText('How this was worked out').click()
  await expect(page.getByRole('cell', { name: 'Šumperk → Olomouc' })).toBeVisible()
})

test('marking yourself paid on the shared link is visible to the collector', async ({ page, context }) => {
  await openDemoAtCollect(page)
  const link = await paymentLink(page)
  const tripUrl = page.url()

  const guest = await context.newPage()
  await guest.goto(link)
  await guest.locator('.settle-row', { hasText: 'Terka' }).getByRole('button', { name: 'Mark paid' }).click()
  await expect(guest.locator('.settle-row', { hasText: 'Terka' }).getByText(/✓ paid/)).toBeVisible()

  // Reload the owner's screen: the server is the shared source of truth.
  await page.goto(tripUrl)
  await page.getByRole('button', { name: 'Collect' }).click()
  await expect(page.locator('.settle-row', { hasText: 'Terka' }).getByText(/✓ paid/)).toBeVisible()
  await guest.close()
})

test('a link without its key opens nothing', async ({ page }) => {
  await openDemoAtCollect(page)
  const link = await paymentLink(page)

  await page.goto(link.split('#')[0]!)
  await expect(page.getByText('This link does not open anything')).toBeVisible()
})

test('a link with the wrong key opens nothing', async ({ page }) => {
  await openDemoAtCollect(page)
  const link = await paymentLink(page)

  await page.goto(`${link.split('#')[0]}#${'a'.repeat(32)}`)
  await expect(page.getByText('This link does not open anything')).toBeVisible()
})
