import { expect, test, type Page } from '@playwright/test'

/**
 * A trip is yours because this browser holds its keys. So a question the server
 * never answered must never be read as the answer "gone" — that would throw the
 * keys away over one tunnel, one dead lift, one flaky café wifi.
 */

async function stubPrice(page: Page) {
  await page.route('**/api/pricing/local**', (route) =>
    route.fulfill({ json: { price: null, country: null, reason: 'unknown-country' } }),
  )
}

/** A saved trip, and the browser back on the trip list. */
async function savedTrip(page: Page) {
  await stubPrice(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a trip' }).click()
  await expect(page.getByRole('heading', { name: 'Where the car went' })).toBeVisible()

  await page.getByRole('textbox', { name: 'Trip', exact: true }).fill('Alps')
  await page.waitForResponse(
    (response) => response.url().includes('/api/trips') && response.request().method() !== 'GET',
  )

  const url = page.url()
  await page.goto('/')
  return url
}

/** Every read of a trip fails the way a bad connection fails. */
async function cutTheLine(page: Page) {
  await page.route('**/api/trips/**', (route) =>
    route.request().method() === 'GET' ? route.abort('connectionfailed') : route.continue(),
  )
}

test('a trip you cannot reach is not a trip you have lost', async ({ page }) => {
  const tripUrl = await savedTrip(page)

  await cutTheLine(page)
  await page.goto(tripUrl)

  // Not "this trip is not in this browser" — it is, and saying otherwise sends
  // people looking for a link they never needed.
  await expect(page.getByText(/could not reach/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()

  await page.unroute('**/api/trips/**')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('textbox', { name: 'Trip', exact: true })).toHaveValue('Alps')
})

test('the trip is still on the list after a failed load', async ({ page }) => {
  const tripUrl = await savedTrip(page)

  await cutTheLine(page)
  await page.goto(tripUrl)
  await expect(page.getByText(/could not reach/i)).toBeVisible()

  await page.unroute('**/api/trips/**')
  await page.goto('/')
  await expect(page.getByRole('link', { name: /Alps/ })).toBeVisible()
})

test('a shared link that cannot be reached says so, and offers another go', async ({ page }) => {
  await stubPrice(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Open the example trip' }).click()
  await expect(page.getByRole('heading', { name: 'Where the car went' })).toBeVisible()
  await page.getByLabel('Your Revolut handle').fill('mattsivak')
  await page.waitForResponse(
    (response) => response.url().includes('/api/trips/') && response.request().method() === 'PUT',
  )
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: 'Copy the payment link' }).click()
  const link = await page.evaluate(() => navigator.clipboard.readText())

  await cutTheLine(page)
  await page.goto(link)

  await expect(page.getByText(/could not reach/i)).toBeVisible()
  await expect(page.getByText('This link does not open anything')).toHaveCount(0)
})

/**
 * Trips made by the browser-only version are moved onto the server on first
 * sight, and the app says so. It said so *instead of* showing the list: one
 * `v-else-if` chain, so the good news replaced the trips it was about.
 */
test('the trips are still listed after they are moved to the server', async ({ page }) => {
  await stubPrice(page)
  await page.goto('/')

  await page.evaluate(() => {
    window.localStorage.setItem(
      'trip-cost-splitter:trip:legacy-1',
      JSON.stringify({
        id: 'legacy-1',
        title: 'Older trip',
        people: [{ id: 'ann', name: 'Ann' }],
        driverId: 'ann',
        segments: [],
      }),
    )
  })

  await page.reload()

  await expect(page.getByText(/Moved 1 trip/)).toBeVisible()
  await expect(page.getByRole('link', { name: /Older trip/ })).toBeVisible()
})

/**
 * This app is used at pumps and tollbooths. Every figure it asks for is a
 * number, and a bare `type="number"` opens the punctuation keyboard on iOS
 * rather than the keypad.
 */
test('every number field asks for the number keyboard', async ({ page }) => {
  await stubPrice(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Open the example trip' }).click()
  await expect(page.getByRole('heading', { name: 'Where the car went' })).toBeVisible()

  await expect(page.locator('input[type="number"]:not([inputmode])')).toHaveCount(0)
})

/**
 * Pressing a button that then disables itself hands focus back to the document
 * — so a keyboard user who marks somebody paid is thrown to the top of the page
 * with no word on whether it worked.
 */
test('marking somebody paid keeps the keyboard where it was', async ({ page }) => {
  await stubPrice(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Open the example trip' }).click()
  await expect(page.getByRole('heading', { name: 'Where the car went' })).toBeVisible()
  const mark = page.getByRole('button', { name: 'Mark paid' }).first()
  await mark.focus()
  await page.keyboard.press('Enter')

  await expect(page.getByRole('button', { name: 'Undo' }).first()).toBeVisible()
  await expect(page.locator('button:focus')).toHaveCount(1)
})
