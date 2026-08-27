import { expect, test, type Locator, type Page } from '@playwright/test'

/** One person's line in the split, and its working. */
const person = (page: Page, name: string): Locator => page.getByRole('group', { name: `${name}'s share` })

async function workingOf(page: Page, name: string): Promise<Locator> {
  const line = person(page, name)
  await line.locator('summary').click()
  return line.locator('.person__working')
}

/** One expense, named and priced. `kind` moves it out of fuel into extras. */
async function addExpense(page: Page, label: string, amount: string, kind: 'Fuel' | 'Extra' = 'Fuel') {
  await page.getByRole('button', { name: 'Add an expense' }).click()
  const row = page.locator('.expense').last()
  await row.getByLabel('What it was for').fill(label)
  await row.getByLabel('Amount').fill(amount)
  if (kind === 'Extra') {
    await openSentence(row)
    await row.locator('label.toggle', { hasText: 'Extra' }).click()
    // Leave it shut either way, so a test that opens it finds it closed.
    await row.getByRole('button', { name: 'Done' }).click()
  }
  return row
}

/** The tappable "split · who paid" line that opens an expense. */
async function openSentence(row: Locator) {
  await row
    .getByRole('button', { name: /Fuel for the whole trip|Split evenly|Set for each|Charged to/ })
    .click()
}

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
  for (const name of ['Matthew', 'Janca', 'Terka']) {
    await page.getByPlaceholder('Name', { exact: true }).fill(name)
    await page.getByRole('button', { name: 'Add person' }).click()
  }
  await page.getByLabel('Kč per L').fill('40')
  await page.getByRole('button', { name: 'Add a drive' }).click()
  await page.getByLabel('Distance km').fill('100')
  await page.getByRole('button', { name: 'Everyone', exact: true }).click()
}

/** The split control belonging to one cost, named after it. */
const costBlock = (page: Page, label: string) => page.getByRole('group', { name: label })

test('a cost can be charged to only the people it was for', async ({ page }) => {
  await tripWithThree(page)
  await addExpense(page, 'Austrian vignette', '300', 'Extra')

  const cost = costBlock(page, 'Austrian vignette')
  await expect(cost).toContainText('everyone')

  await openSentence(cost)
  await cost.locator('.expense__who label.toggle', { hasText: 'Terka' }).click()

  // The control says who is being charged without anybody opening it.
  await expect(cost).toContainText('Matthew and Janca')

  await expect(await workingOf(page, 'Janca')).toContainText('150,00 Kč')
  // Terka is not charged for it at all, so her working has no extras line.
  await expect(await workingOf(page, 'Terka')).not.toContainText('Extras')
})

test('a cost can be split into the amounts each person actually owes', async ({ page }) => {
  await tripWithThree(page)
  await addExpense(page, 'Ferry', '300', 'Extra')

  const cost = costBlock(page, 'Ferry')
  await openSentence(cost)
  await cost.locator('.expense__who label.toggle', { hasText: 'Set each amount' }).click()

  await cost.getByLabel('Amount for Matthew').fill('200')
  await cost.getByLabel('Amount for Janca').fill('50')
  await cost.getByLabel('Amount for Terka').fill('50')

  await expect(await workingOf(page, 'Matthew')).toContainText('200,00 Kč')
  await expect(await workingOf(page, 'Janca')).toContainText('50,00 Kč')
  await expect(await workingOf(page, 'Terka')).toContainText('50,00 Kč')
})

test('amounts that do not add up to the cost are called out', async ({ page }) => {
  await tripWithThree(page)
  await addExpense(page, 'Ferry', '300', 'Extra')

  const cost = costBlock(page, 'Ferry')
  await openSentence(cost)
  await cost.locator('.expense__who label.toggle', { hasText: 'Set each amount' }).click()
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
  await addExpense(page, 'Austrian vignette', '300', 'Extra')

  const cost = costBlock(page, 'Austrian vignette')
  await openSentence(cost)
  await cost.locator('.expense__who label.toggle', { hasText: 'Terka' }).click()
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
    await addExpense(page, 'Austrian vignette', '300', 'Extra')

    const cost = costBlock(page, 'Austrian vignette')
    await openSentence(cost)

    const box = await cost.locator('.expense__panel').boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(300)
  })
})
