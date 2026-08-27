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

/** Put an expense in somebody's name, from the pills inside it. */
async function payerIs(row: Locator, name: string) {
  await openSentence(row)
  await row.locator('.expense__payers label.toggle').filter({ hasText: name }).click()
}

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
  for (const name of ['Matthew', 'Janca']) {
    await page.getByPlaceholder('Name', { exact: true }).fill(name)
    await page.getByRole('button', { name: 'Add person' }).click()
  }
  await page.getByRole('button', { name: 'Add a drive' }).click()
  await page.getByLabel('Distance km').fill('100')
  await page.getByRole('button', { name: 'Everyone', exact: true }).click()
  await page.getByText('Price from the receipts').click()
  return await addExpense(page, 'The tank', '400')
}

test("a receipt can be put in somebody else's name", async ({ page }) => {
  const receipt = await tripPricedFromReceipts(page)

  // Unmarked, it is the driver's money, exactly as it always was.
  await expect(await workingOf(page, 'Matthew')).toContainText('Already paid')
  await expect(await workingOf(page, 'Janca')).not.toContainText('Already paid')

  await payerIs(receipt, 'Janca')

  await expect(await workingOf(page, 'Janca')).toContainText('400,00 Kč')
})

test('somebody who laid out more than their share is owed the difference', async ({ page }) => {
  const receipt = await tripPricedFromReceipts(page)
  await payerIs(receipt, 'Janca')

  // Janca owes 200 of the tank and paid 400, so 200 comes back to her.
  // Whole units, because a net position is what somebody actually transfers.
  await expect(person(page, 'Janca')).toContainText('200 Kč')
  await expect(person(page, 'Janca')).toContainText('gets back')
})

test('the person who is owed money is not asked to pay any', async ({ page }) => {
  const receipt = await tripPricedFromReceipts(page)
  await payerIs(receipt, 'Janca')
  await page.getByLabel('Your Revolut handle').fill('mattsivak')

  await expect(page.getByRole('link', { name: /^Pay .*Janca/ })).toHaveCount(0)
  const back = page.locator('.settle-back')
  await expect(back).toContainText('sends back')
  await expect(back).toContainText('Janca')
})

test('the shared page says whose money each receipt was', async ({ page }) => {
  const receipt = await tripPricedFromReceipts(page)
  await payerIs(receipt, 'Janca')
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
  await openSentence(receipt)

  const payers = receipt.locator('.expense__payers label.toggle')
  await expect(payers.filter({ hasText: 'Matthew' })).toHaveCount(1)
  await expect(payers.filter({ hasText: 'Matthew' })).toHaveClass(/is-on/)
})
