import { expect, test, type Locator, type Page } from '@playwright/test'

/** One person's line in the split, and its working. */
const person = (page: Page, name: string): Locator => page.getByRole('group', { name: `${name}'s share` })


/**
 * One list of expenses.
 *
 * There used to be two, with asymmetric powers: a receipt took a date and a
 * foreign currency but could not say who it was for, and a toll said who it was
 * for but took no date, so it could never have its own exchange rate. Neither
 * slot fitted a hotel. Filing paperwork on the calculator's behalf is not the
 * user's job.
 */

async function stubPrice(page: Page) {
  await page.route('**/api/pricing/local**', (route) =>
    route.fulfill({ json: { price: null, country: null, reason: 'unknown-country' } }),
  )
}

/** Three people, one drive, everybody aboard, on the Split step. */
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

  await page.getByRole('navigation').getByRole('button', { name: 'Route' }).click()
  await page.getByLabel('Kč per L').fill('40')
  await page.getByRole('button', { name: 'Add a drive' }).click()
  await page.getByLabel('Distance km').fill('100')

  await page.getByRole('navigation').getByRole('button', { name: 'Assign' }).click()
  await page.getByRole('button', { name: 'Everyone', exact: true }).click()

  await page.getByRole('navigation').getByRole('button', { name: 'Split' }).click()
}

/** The tappable "split · who paid" line that opens an expense. */
async function openSentence(row: Locator) {
  await row
    .getByRole('button', { name: /Fuel for the whole trip|Split evenly|Set for each|Charged to/ })
    .click()
}

/** Add one expense and name it. Fuel unless told otherwise. */
async function addExpense(page: Page, label: string, amount: string, kind: 'Fuel' | 'Extra' = 'Fuel') {
  await page.getByRole('button', { name: 'Add an expense' }).click()
  const row = page.locator('.expense').last()
  await row.getByLabel('What it was for').fill(label)
  await row.getByLabel('Amount').fill(amount)
  if (kind === 'Extra') {
    await row.getByRole('button', { name: /Fuel for the whole trip|Split evenly/ }).click()
    await row.locator('label.toggle', { hasText: 'Extra' }).click()
    await row.getByRole('button', { name: 'Done' }).click()
  }
  return row
}

test('fuel and tolls are one list, not two', async ({ page }) => {
  await tripWithThree(page)

  await addExpense(page, 'The tank', '600')
  await addExpense(page, 'Motorway toll', '300', 'Extra')

  await expect(page.locator('.expense')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Add a receipt' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add a cost' })).toHaveCount(0)
})

test('an expense says who paid and how it is split, in a sentence', async ({ page }) => {
  await tripWithThree(page)
  const row = await addExpense(page, 'The tank', '600')

  await expect(row).toContainText('Fuel for the whole trip')
  await expect(row).toContainText('Matthew paid')
})

test('who paid is chosen from the people, each of them once', async ({ page }) => {
  await tripWithThree(page)
  const row = await addExpense(page, 'The tank', '600')

  await openSentence(row)
  const payers = row.locator('.expense__payers label.toggle')
  await expect(payers).toHaveCount(3)
  await expect(payers.filter({ hasText: 'Matthew' })).toHaveCount(1)

  await payers.filter({ hasText: 'Janca' }).click()
  await expect(row).toContainText('Janca paid')
})

test('an extra can be charged to only the people it was for', async ({ page }) => {
  await tripWithThree(page)
  const row = await addExpense(page, 'Vignette', '300', 'Extra')

  await expect(row).toContainText('Split evenly between everyone')
  await openSentence(row)
  await row.locator('.expense__who label.toggle', { hasText: 'Terka' }).click()

  await expect(row).toContainText('Split evenly between Matthew and Janca')
})

test('an expense moved from fuel to extras stops paying for the fuel', async ({ page }) => {
  await tripWithThree(page)
  await page.getByText('Price from the receipts').click()
  const row = await addExpense(page, 'The tank', '600')

  await expect(person(page, 'Janca')).toContainText('200 Kč')

  // As an extra it is split evenly too, so the figure survives — but it stops
  // being the price of the fuel, and the fuel now has no receipts behind it.
  await openSentence(row)
  await row.locator('label.toggle', { hasText: 'Extra' }).click()

  await expect(page.getByText('Add a receipt — the price per unit is derived')).toBeVisible()
})

test('an extra carries its own date, and so its own exchange rate', async ({ page }) => {
  await tripWithThree(page)
  const row = await addExpense(page, 'Vignette', '300', 'Extra')

  await row.getByLabel('Date').fill('2026-08-14')
  await expect(row.getByLabel('Date')).toHaveValue('2026-08-14')
})
