import { expect, test, type Page } from '@playwright/test'
import { goTo } from './support/trip'

/**
 * The way back into your own trip.
 *
 * There are no accounts, so a trip is yours because this browser holds its edit
 * key. Clear the site data, or pick up your laptop instead of your phone, and
 * the trip is gone from you while still sitting on the server. The edit link is
 * that key in a form you can carry.
 */

async function stubPrice(page: Page) {
  await page.route('**/api/pricing/local**', (route) =>
    route.fulfill({ json: { price: null, country: null, reason: 'unknown-country' } }),
  )
}

/** A named trip with one person on it, saved, sitting on the Collect step. */
async function makeTrip(page: Page) {
  await stubPrice(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a trip' }).click()
  await expect(page.getByRole('heading', { name: 'Who came along' })).toBeVisible()

  await page.getByRole('textbox', { name: 'Trip', exact: true }).fill('Alps')
  await page.getByPlaceholder('Name', { exact: true }).fill('Matthew')
  await page.getByRole('button', { name: 'Add person' }).click()
  await page.waitForResponse(
    (response) => response.url().includes('/api/trips/') && response.request().method() === 'PUT',
  )
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
}

async function copyEditLink(page: Page): Promise<string> {
  await goTo(page, 'Settle up')
  await page.getByRole('button', { name: 'Copy the link back to this trip' }).click()
  return await page.evaluate(() => navigator.clipboard.readText())
}

/**
 * As close to another device as one browser gets: leave the trip's page first,
 * so opening the link is a real load and not a jump to a fragment of the page
 * already sitting there with the trip in memory.
 */
async function forgetEverything(page: Page) {
  await page.goto('/')
  await page.evaluate(() => window.localStorage.clear())
}

test('an edit link opens your trip in a browser that has forgotten it', async ({ page }) => {
  await makeTrip(page)
  const link = await copyEditLink(page)

  // The same thing that happens when you clear site data, or open your laptop.
  await forgetEverything(page)
  await page.goto(link)

  await expect(page.getByRole('textbox', { name: 'Trip', exact: true })).toHaveValue('Alps')

  // And it is one of your trips again, not a one-time view.
  await page.goto('/')
  await expect(page.getByRole('link', { name: /Alps/ })).toBeVisible()
})

test('the trip is editable from there, not just readable', async ({ page }) => {
  await makeTrip(page)
  const link = await copyEditLink(page)

  await forgetEverything(page)
  await page.goto(link)

  await page.getByRole('textbox', { name: 'Trip', exact: true }).fill('Alps, renamed')
  await page.waitForResponse(
    (response) => response.url().includes('/api/trips/') && response.request().method() === 'PUT',
  )

  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Trip', exact: true })).toHaveValue('Alps, renamed')
})

/**
 * The group's link must not become an edit link by being retyped into the
 * wizard's address. The server decides that, not the browser.
 */
test('a view key does not open the wizard', async ({ page }) => {
  await makeTrip(page)
  await goTo(page, 'Settle up')
  await page.getByRole('button', { name: 'Copy the payment link' }).click()
  const viewLink = await page.evaluate(() => navigator.clipboard.readText())

  const [, id, key] = viewLink.match(/\/view\/([^#]+)#(.+)$/) ?? []
  expect(id).toBeTruthy()

  await forgetEverything(page)
  await page.goto(`/trip/${id}#${key}`)

  await expect(page.getByText('That trip is not in this browser')).toBeVisible()
})
