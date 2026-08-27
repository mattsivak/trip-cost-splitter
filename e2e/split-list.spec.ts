import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * The split, as one line per person.
 *
 * It was an eight-column table — Person, Fuel, Car, Extras, Their share,
 * Already paid, To pay, Balance — to deliver one number each. Six of those
 * columns are working, not answer, and on a phone every row became a card of
 * seven labelled lines with the only number that matters last.
 */

async function stubPrice(page: Page) {
  await page.route('**/api/pricing/local**', (route) =>
    route.fulfill({ json: { price: null, country: null, reason: 'unknown-country' } }),
  )
}

/** One expense, named and priced. `kind` moves it out of fuel into extras. */
async function addExpense(page: Page, label: string, amount: string, kind: 'Fuel' | 'Extra' = 'Fuel') {
  await page.getByRole('button', { name: 'Add an expense' }).click()
  const row = page.locator('.expense').last()
  await row.getByLabel('What it was for').fill(label)
  await row.getByLabel('Amount').fill(amount)
  if (kind === 'Extra') {
    await row
      .getByRole('button', { name: /Fuel for the whole trip|Split evenly|Set for each|Charged to/ })
      .click()
    await row.locator('label.toggle', { hasText: 'Extra' }).click()
    await row.getByRole('button', { name: 'Done' }).click()
  }
  return row
}

/**
 * Two people, 100 km, priced from one 600 tank so each owes 300 of it, and a
 * toll of 100 so the bill has more than one part to it.
 */
async function tripWithTwo(page: Page) {
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
  await addExpense(page, 'The tank', '600')
  await addExpense(page, 'Motorway toll', '100', 'Extra')
}

const person = (page: Page, name: string): Locator => page.getByRole('group', { name: `${name}'s share` })

test('a person is a name, one figure and a verb', async ({ page }) => {
  await tripWithTwo(page)

  const janca = person(page, 'Janca')
  // 300 of the tank and 50 of the toll, and she has paid for none of it.
  await expect(janca).toContainText('350 Kč')
  await expect(janca).toContainText('sends')
})

test('the figure is what actually changes hands, not what was billed', async ({ page }) => {
  await tripWithTwo(page)

  const row = page.getByRole('group', { name: 'The tank' })
  await row
    .getByRole('button', { name: /Fuel for the whole trip|Split evenly|Set for each|Charged to/ })
    .click()
  await row.locator('.expense__payers label.toggle').filter({ hasText: 'Janca' }).click()

  // Janca laid out 600 and owes 350 of the bill: 250 comes back to her.
  const janca = person(page, 'Janca')
  await expect(janca).toContainText('250 Kč')
  await expect(janca).toContainText('gets back')
})

test('the working for one person opens on their own line', async ({ page }) => {
  await tripWithTwo(page)

  const janca = person(page, 'Janca')
  await expect(janca.locator('.person__working')).toBeHidden()

  await janca.locator('summary').click()
  await expect(janca.locator('.person__working')).toBeVisible()
  await expect(janca).toContainText('300,00 Kč')
  await expect(janca).toContainText('50,00 Kč')
})

test('the driver carries the rounding, on the line that carries it', async ({ page }) => {
  await stubPrice(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a trip' }).click()
  for (const name of ['Matthew', 'Janca', 'Terka']) {
    await page.getByPlaceholder('Name', { exact: true }).fill(name)
    await page.getByRole('button', { name: 'Add person' }).click()
  }
  await page.getByRole('button', { name: 'Add a drive' }).click()
  await page.getByLabel('Distance km').fill('100')
  await page.getByRole('button', { name: 'Everyone', exact: true }).click()
  await page.getByText('Price from the receipts').click()
  // 100,50 into three does not go, and somebody has to carry the difference.
  await addExpense(page, 'The tank', '100.50')

  await expect(person(page, 'Matthew')).toContainText('rounding')
})

test('the collection is a sentence, not a totals row', async ({ page }) => {
  await tripWithTwo(page)

  await expect(page.getByText(/Collect 350 Kč/)).toBeVisible()
  await expect(page.getByRole('row', { name: /Total/ })).toHaveCount(0)
})
