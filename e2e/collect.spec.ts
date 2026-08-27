import { expect, test, type Page } from '@playwright/test'
import { addDrive, everyoneAboard, goTo, stubPrice } from './support/trip'

async function openDemoAtCollect(page: Page) {
  await stubPrice(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Open the example trip' }).click()
  await expect(page.getByRole('heading', { name: 'Who came along' })).toBeVisible()
  await goTo(page, 'Settle up')
  await expect(page.getByRole('heading', { name: 'Getting it back' })).toBeVisible()
}

/** The payment link, read out of the clipboard the way a person would paste it. */
async function copyLink(page: Page): Promise<string> {
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
  const link = await copyLink(page)
  expect(link).toMatch(/\/view\/[^#]+#[0-9a-f]{32}$/)
})

test('the Revolut handle builds a payment link per person', async ({ page }) => {
  await openDemoAtCollect(page)

  await page.getByLabel('Your Revolut handle').fill('mattsivak')
  await expect(page.getByRole('link', { name: /Open https:\/\/revolut\.me\/mattsivak/ })).toBeVisible()

  // Terka owes 804 Kč on the example trip.
  const pay = page.getByRole('link', { name: 'Pay 804 Kč' })
  await expect(pay).toHaveAttribute(
    'href',
    'https://revolut.me/mattsivak?currency=CZK&amount=80400&note=Terka%20-%20Volkswagen%20August%20trip',
  )
})

test('the field holds the handle alone, and reduces a pasted link to it', async ({ page }) => {
  await openDemoAtCollect(page)

  const field = page.getByLabel('Your Revolut handle')
  await expect(page.getByText('revolut.me/', { exact: true })).toBeVisible()

  // People paste the whole link; it should collapse to just the handle.
  await field.fill('https://revolut.me/mattsivak')
  await expect(field).toHaveValue('mattsivak')

  await field.fill('@mattsivak')
  await expect(field).toHaveValue('mattsivak')

  await field.fill('revolut.me/mattsivak/999eur')
  await expect(field).toHaveValue('mattsivak')
})

test('typing a handle with a dot is not mangled mid-keystroke', async ({ page }) => {
  await openDemoAtCollect(page)

  const field = page.getByLabel('Your Revolut handle')
  await field.pressSequentially('matt.sivak')
  await expect(field).toHaveValue('matt.sivak')
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
  const link = await copyLink(page)

  await page.goto(link)
  await expect(page.getByRole('heading', { name: 'Volkswagen August trip' })).toBeVisible()
  // The page no longer says in words that it is read-only; it demonstrates it.
  // None of the wizard is reachable from here.
  await expect(page.getByRole('button', { name: 'Route' })).toHaveCount(0)
  await expect(page.getByLabel('Distance km')).toHaveCount(0)

  await expect(page.getByRole('link', { name: 'Pay 804 Kč' })).toBeVisible()

  // The destination is spelled out, not only hidden inside a button.
  await expect(page.getByRole('link', { name: 'revolut.me/mattsivak' })).toBeVisible()
  await expect(page.getByText('Money goes to Matthew')).toBeVisible()

  await page.getByRole('group', { name: 'Colour theme' }).waitFor()
  await page.getByText('How this was worked out').click()
  await expect(page.getByRole('cell', { name: 'Šumperk → Olomouc' })).toBeVisible()
})

test('marking yourself paid on the shared link is visible to the collector', async ({ page, context }) => {
  await openDemoAtCollect(page)
  const link = await copyLink(page)
  const tripUrl = page.url()

  const guest = await context.newPage()
  await guest.goto(link)
  await guest.locator('.settle-row', { hasText: 'Terka' }).getByRole('button', { name: 'Mark paid' }).click()
  await expect(guest.locator('.settle-row', { hasText: 'Terka' }).getByText(/✓ paid/)).toBeVisible()

  // Reload the owner's screen: the server is the shared source of truth.
  await page.goto(tripUrl)
  await expect(page.locator('.settle-row', { hasText: 'Terka' }).getByText(/✓ paid/)).toBeVisible()
  await guest.close()
})

test('a collector with the trip open cannot wipe a mark made on the link', async ({ page, context }) => {
  await openDemoAtCollect(page)
  const link = await copyLink(page)
  const tripUrl = page.url()

  // The collector edits something, so an autosave of the whole trip is pending.
  await goTo(page, 'Route')
  await page.getByLabel('Kč per L').fill('44')

  const guest = await context.newPage()
  await guest.goto(link)
  await guest.locator('.settle-row', { hasText: 'Anet' }).getByRole('button', { name: 'Mark paid' }).click()
  await expect(guest.locator('.settle-row', { hasText: 'Anet' }).getByText(/✓ paid/)).toBeVisible()

  // Let the collector's autosave land, then check it did not overwrite the mark.
  await page.waitForResponse(
    (response) => response.url().includes('/api/trips/') && response.request().method() === 'PUT',
  )
  await page.goto(tripUrl)
  await expect(page.locator('.settle-row', { hasText: 'Anet' }).getByText(/✓ paid/)).toBeVisible()
  await guest.close()
})

test('a trip made from scratch gets payment buttons, not just the promise of them', async ({
  page,
  context,
}) => {
  // Every other test here uses the example trip, which hardcodes its currency
  // code. A trip started from nothing has only the symbol, and that is the
  // case that was broken.
  await stubPrice(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a trip' }).click()
  await expect(page.getByRole('heading', { name: 'Who came along' })).toBeVisible()
  for (const name of ['Matthew', 'Janca']) {
    await page.getByPlaceholder('Name', { exact: true }).fill(name)
    await page.getByRole('button', { name: 'Add person' }).click()
  }
  await goTo(page, 'Route')
  // The stubbed lookup leaves no price, so without this nobody owes anything.
  await page.getByLabel('Kč per L').fill('40')
  await addDrive(page, 'A', 'B', '100')
  await everyoneAboard(page)
  await goTo(page, 'Settle up')
  await page.getByLabel('Your Revolut handle').fill('mattsivak')
  await expect(page.getByRole('link', { name: /^Pay / })).toBeVisible()
  await waitForSave(page)

  const link = await copyLink(page)
  const guest = await context.newPage()
  await guest.goto(link)

  // The banner and the buttons must agree.
  await expect(guest.getByText('Each button below opens Revolut')).toBeVisible()
  await expect(guest.getByRole('link', { name: /^Pay / })).toBeVisible()
  await expect(guest.getByRole('link', { name: /^Pay / }).first()).toHaveAttribute(
    'href',
    /^https:\/\/revolut\.me\/mattsivak\?currency=CZK&amount=\d+&note=/,
  )
  await guest.close()
})

test('a link without its key opens nothing', async ({ page }) => {
  await openDemoAtCollect(page)
  const link = await copyLink(page)

  await page.goto(link.split('#')[0]!)
  await expect(page.getByText('This link does not open anything')).toBeVisible()
})

test('a link with the wrong key opens nothing', async ({ page }) => {
  await openDemoAtCollect(page)
  const link = await copyLink(page)

  await page.goto(`${link.split('#')[0]}#${'a'.repeat(32)}`)
  await expect(page.getByText('This link does not open anything')).toBeVisible()
})
