import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Money somebody other than the driver put down.
 *
 * Until now the app had a rich vocabulary for who owes and none at all for who
 * paid: every receipt and every toll was the driver's, and a passenger who
 * bought the second tank had to do the arithmetic in their head — which is the
 * one thing this app exists to abolish.
 */

async function stubPrice(page: Page) {
  await page.route('**/api/pricing/local**', (route) =>
    route.fulfill({ json: { price: null, country: null, reason: 'unknown-country' } }),
  )
}

/**
 * Two people, 100 km, priced from the receipts. Matthew drives; the whole bill
 * is one 400 tank, so each of them owes 200 of it.
 */
async function tripPricedFromReceipts(page: Page) {
  await stubPrice(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a trip' }).click()
  await expect(page.getByRole('heading', { name: 'Where the car went' })).toBeVisible()

  await page.getByRole('button', { name: 'People' }).click()
  for (const name of ['Matthew', 'Janca']) {
    await page.getByPlaceholder('Name').fill(name)
    await page.getByRole('button', { name: 'Add person' }).click()
  }

  await page.getByRole('button', { name: 'Route' }).click()
  await page.getByRole('button', { name: 'Add a drive' }).click()
  await page.getByLabel('Distance km').fill('100')

  await page.getByRole('button', { name: 'Assign' }).click()
  await page.getByRole('button', { name: 'Everyone', exact: true }).click()

  await page.getByRole('button', { name: 'Split' }).click()
  await page.getByText('Price from the receipts').click()
  await page.getByRole('button', { name: 'Add a receipt' }).click()

  const receipt = page.locator('.entry-row').first()
  await receipt.getByLabel('What it was for').fill('The tank')
  await receipt.getByLabel('Amount').fill('400')
  return receipt
}

const cellFor = (page: Page, name: string, column: string): Locator =>
  page.getByRole('row', { name: new RegExp(name) }).locator(`td[data-label="${column}"]`)

test("a receipt can be put in somebody else's name", async ({ page }) => {
  const receipt = await tripPricedFromReceipts(page)

  // Unmarked, it is the driver's money, exactly as it always was.
  await expect(cellFor(page, 'Matthew', 'Already paid')).toHaveCount(0)

  await receipt.getByLabel('Paid by').selectOption({ label: 'Janca' })

  await expect(cellFor(page, 'Janca', 'Already paid')).toHaveText('400,00 Kč')
  await expect(cellFor(page, 'Matthew', 'Already paid')).toHaveText('0,00 Kč')
})

test('somebody who laid out more than their share is owed the difference', async ({ page }) => {
  const receipt = await tripPricedFromReceipts(page)
  await receipt.getByLabel('Paid by').selectOption({ label: 'Janca' })

  // Janca owes 200 of the tank and paid 400, so 200 comes back to her.
  // Whole units, because a net position is what somebody actually transfers.
  await expect(cellFor(page, 'Janca', 'Balance')).toContainText('200 Kč')
  await expect(cellFor(page, 'Janca', 'Balance')).toContainText('gets back')
})

test('the person who is owed money is not asked to pay any', async ({ page }) => {
  const receipt = await tripPricedFromReceipts(page)
  await receipt.getByLabel('Paid by').selectOption({ label: 'Janca' })

  await page.getByRole('button', { name: 'Collect' }).click()
  await page.getByLabel('Your Revolut handle').fill('mattsivak')

  await expect(page.getByRole('link', { name: /^Pay .*Janca/ })).toHaveCount(0)
  await expect(page.getByText('sends back')).toBeVisible()
  await expect(page.getByText('Janca')).toBeVisible()
})

test('the shared page says whose money each receipt was', async ({ page }) => {
  const receipt = await tripPricedFromReceipts(page)
  await receipt.getByLabel('Paid by').selectOption({ label: 'Janca' })

  await page.getByRole('button', { name: 'Collect' }).click()
  await page.getByLabel('Your Revolut handle').fill('mattsivak')
  await page.waitForResponse(
    (response) => response.url().includes('/api/trips/') && response.request().method() === 'PUT',
  )

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: 'Copy the payment link' }).click()
  await page.goto(await page.evaluate(() => navigator.clipboard.readText()))

  await page.locator('summary', { hasText: /worked out/i }).click()
  const receipts = page.getByRole('region', { name: 'What was already paid' })
  await expect(receipts.getByRole('row', { name: /The tank/ })).toContainText('Janca')
})

/**
 * The bug that started the redesign: the list offered "Matthew paid" as a
 * sentinel for "the driver", and then Matthew again by name. Two options, one
 * meaning, and the tick on the one that looked wrong.
 */
test('the driver is in the payer list once, already chosen', async ({ page }) => {
  const receipt = await tripPricedFromReceipts(page)
  const payer = receipt.getByLabel('Paid by')

  await expect(payer.getByRole('option', { name: /Matthew/ })).toHaveCount(1)
  await expect(payer.getByRole('option', { name: 'Matthew (driver)' })).toHaveCount(1)
  const matthew = await payer.getByRole('option', { name: /Matthew/ }).getAttribute('value')
  await expect(payer).toHaveValue(matthew ?? '')
})

/**
 * A totals row has to line up with the columns above it. When upkeep is being
 * charged the head grows a column and the footer did not, so every figure in
 * the footer sat under the wrong heading.
 */
test('the totals row lines up with the columns it totals', async ({ page }) => {
  const receipt = await tripPricedFromReceipts(page)
  await receipt.getByLabel('Paid by').selectOption({ label: 'Janca' })

  await page.getByRole('button', { name: 'Route' }).click()
  await page.getByLabel('Kč per km, car costs').fill('2')
  await page.getByRole('button', { name: 'Split' }).click()

  const split = page.getByRole('table').first()
  const headings = await split.getByRole('columnheader').count()
  const totals = split.getByRole('row', { name: /Total/ })

  // Counting spans, not cells: the last one covers two columns on purpose.
  const covered = await totals
    .getByRole('cell')
    .evaluateAll((cells) => cells.reduce((n, cell) => n + (cell as HTMLTableCellElement).colSpan, 0))
  expect(covered).toBe(headings)
  // And no cell of it is an empty labelled line on a phone.
  await expect(totals.locator('td[data-label]:empty')).toHaveCount(0)
})
