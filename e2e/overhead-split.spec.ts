import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Who a non-fuel cost is actually for.
 *
 * `allocateOverhead` has always been able to charge a cost to a chosen few, or
 * to split it into the exact amounts each person owes — the wizard just never
 * offered either. A vignette bought for the three who crossed the border is not
 * a cost the fourth person shares, and saying so should not require arithmetic
 * in somebody's head.
 */

async function stubPrice(page: Page) {
  await page.route('**/api/pricing/local**', (route) =>
    route.fulfill({ json: { price: null, country: null, reason: 'unknown-country' } }),
  )
}

/** Three people, one drive, everybody aboard, parked on the Split step. */
async function tripWithThree(page: Page) {
  await stubPrice(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a trip' }).click()
  await expect(page.getByRole('heading', { name: 'Where the car went' })).toBeVisible()

  await page.getByRole('button', { name: 'People' }).click()
  for (const name of ['Matthew', 'Janca', 'Terka']) {
    await page.getByPlaceholder('Name').fill(name)
    await page.getByRole('button', { name: 'Add person' }).click()
  }

  await page.getByRole('button', { name: 'Route' }).click()
  await page.getByLabel('Kč per L').fill('40')
  await page.getByRole('button', { name: 'Add a drive' }).click()
  await page.getByLabel('Distance km').fill('100')

  await page.getByRole('button', { name: 'Assign' }).click()
  await page.getByRole('button', { name: 'Everyone', exact: true }).click()

  await page.getByRole('button', { name: 'Split' }).click()
}

async function addCost(page: Page, label: string, amountMajor: string) {
  await page.getByRole('button', { name: 'Add a cost' }).click()
  const row = page.locator('.entry-row').last()
  await row.getByLabel('What it was for').fill(label)
  await row.getByLabel('Amount').fill(amountMajor)
}

/** The split control belonging to one cost, named after it. */
const costBlock = (page: Page, label: string) => page.getByRole('region', { name: `How ${label} is split` })

/** What one person is charged for non-fuel costs, in the step's own table. */
const otherCell = (page: Page, name: string): Locator =>
  page.getByRole('row', { name: new RegExp(name) }).locator('td[data-label="Extras"]')

test('a cost can be charged to only the people it was for', async ({ page }) => {
  await tripWithThree(page)
  await addCost(page, 'Austrian vignette', '300')

  const cost = costBlock(page, 'Austrian vignette')
  await expect(cost).toContainText('everyone')

  await cost.getByRole('button', { name: 'Change' }).click()
  await cost.locator('label.toggle', { hasText: 'Terka' }).click()

  // The control says who is being charged without anybody opening it.
  await expect(cost).toContainText('Matthew and Janca')

  await expect(otherCell(page, 'Janca')).toHaveText('150,00 Kč')
  await expect(otherCell(page, 'Terka')).toHaveText('0,00 Kč')
})

test('a cost can be split into the amounts each person actually owes', async ({ page }) => {
  await tripWithThree(page)
  await addCost(page, 'Ferry', '300')

  const cost = costBlock(page, 'Ferry')
  await cost.getByRole('button', { name: 'Change' }).click()
  await cost.locator('label.toggle', { hasText: 'Set each amount' }).click()

  await cost.getByLabel('Amount for Matthew').fill('200')
  await cost.getByLabel('Amount for Janca').fill('50')
  await cost.getByLabel('Amount for Terka').fill('50')

  await expect(otherCell(page, 'Matthew')).toHaveText('200,00 Kč')
  await expect(otherCell(page, 'Janca')).toHaveText('50,00 Kč')
  await expect(otherCell(page, 'Terka')).toHaveText('50,00 Kč')
})

test('amounts that do not add up to the cost are called out', async ({ page }) => {
  await tripWithThree(page)
  await addCost(page, 'Ferry', '300')

  const cost = costBlock(page, 'Ferry')
  await cost.getByRole('button', { name: 'Change' }).click()
  await cost.locator('label.toggle', { hasText: 'Set each amount' }).click()
  // Seeded with the even split, so this is a real disagreement with the 300.
  await cost.getByLabel('Amount for Matthew').fill('250')

  await expect(page.getByText('add up to another')).toBeVisible()
})

/**
 * The people who get the link are the ones who most need to know a cost was
 * not theirs. "Tolls and other costs — 300 Kč" with no names beside it invites
 * exactly the argument the app exists to prevent.
 */
test('the shared page says who a restricted cost was charged to', async ({ page }) => {
  await tripWithThree(page)
  await addCost(page, 'Austrian vignette', '300')

  const cost = costBlock(page, 'Austrian vignette')
  await cost.getByRole('button', { name: 'Change' }).click()
  await cost.locator('label.toggle', { hasText: 'Terka' }).click()

  await page.getByRole('button', { name: 'Collect' }).click()
  await page.getByLabel('Your Revolut handle').fill('mattsivak')
  await page.waitForResponse(
    (response) => response.url().includes('/api/trips/') && response.request().method() === 'PUT',
  )

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: 'Copy the payment link' }).click()
  await page.goto(await page.evaluate(() => navigator.clipboard.readText()))

  await page.locator('summary', { hasText: /worked out/i }).click()
  const costs = page.getByRole('region', { name: 'Extras' })
  await expect(costs.getByRole('row', { name: /Austrian vignette/ })).toContainText('Matthew and Janca')
})

/**
 * The entry columns sit side by side on a wide screen. Once a cost can say who
 * it is for, half a phone screen is not enough room for it — the pills end up
 * one per line and the amount boxes are barely wider than their own numbers.
 */
test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the split control gets the width of the screen', async ({ page }) => {
    await tripWithThree(page)
    await addCost(page, 'Austrian vignette', '300')

    const cost = costBlock(page, 'Austrian vignette')
    await cost.getByRole('button', { name: 'Change' }).click()

    const box = await cost.locator('.overhead__panel').boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(300)
  })
})
