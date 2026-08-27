import { expect, test, type Locator, type Page } from '@playwright/test'

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
 * The working shown on the link you send the group.
 *
 * The people who open this link did not build the trip and were not there for
 * every leg of it. "You owe 804 Kč" is the headline, but the next question is
 * always "for what?", and this is where that gets answered.
 */

async function stubPrice(page: Page) {
  await page.route('**/api/pricing/local**', (route) =>
    route.fulfill({ json: { price: null, country: null, reason: 'unknown-country' } }),
  )
}

/** The example trip, published, and opened the way a recipient opens it. */
async function openPaymentLink(page: Page, options: { dateTheFirstReceipt?: boolean } = {}) {
  await stubPrice(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Open the example trip' }).click()
  await expect(page.getByRole('heading', { name: 'Where the car went' })).toBeVisible()

  if (options.dateTheFirstReceipt) {
    await page.getByRole('button', { name: 'Split' }).click()
    await page.getByLabel('Date').first().fill('2026-08-14')
  }

  await page.getByRole('button', { name: 'Collect' }).click()
  await page.getByLabel('Your Revolut handle').fill('mattsivak')
  await page.waitForResponse(
    (response) => response.url().includes('/api/trips/') && response.request().method() === 'PUT',
  )

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: 'Copy the payment link' }).click()
  const link = await page.evaluate(() => navigator.clipboard.readText())

  await page.goto(link)
  await expect(page.getByRole('heading', { name: 'Volkswagen August trip' })).toBeVisible()
}

const disclosure = (page: Page) => page.locator('summary', { hasText: /worked out/i })

test('the working is a control you would notice, not a footnote', async ({ page }) => {
  await openPaymentLink(page)

  const box = await disclosure(page).boundingBox()
  expect(box).not.toBeNull()
  // The repo's own minimum for something meant to be tapped.
  expect(box!.height).toBeGreaterThanOrEqual(44)
  expect(box!.width).toBeGreaterThan(300)
})

test('the working stays below the payment buttons, where it belongs', async ({ page }) => {
  await openPaymentLink(page)

  const pay = await page.getByRole('link', { name: 'Pay 804 Kč' }).boundingBox()
  const working = await disclosure(page).boundingBox()
  expect(working!.y).toBeGreaterThan(pay!.y)
})

test('the bill says what the money was for, not just how much', async ({ page }) => {
  await openPaymentLink(page)
  await disclosure(page).click()

  const bill = page.getByRole('region', { name: 'The bill' })
  await expect(bill).toContainText('Fuel')
  await expect(bill).toContainText('4 100,63 Kč')
  // 95,4 L at the trip's stated price.
  await expect(bill).toContainText('43,00 Kč per L')
  await expect(bill).toContainText('95,4 L')
})

test('the receipts behind the total are listed by name', async ({ page }) => {
  await openPaymentLink(page)
  await disclosure(page).click()

  const receipts = page.getByRole('region', { name: 'What the driver paid' })
  await expect(receipts.getByRole('cell', { name: 'Visible fuel purchases' })).toBeVisible()
  await expect(receipts.getByRole('cell', { name: '6 033,73 Kč' })).toBeVisible()
  await expect(receipts).toContainText('6 893,73 Kč')
})

/**
 * A receipt may carry a date, and then the table grows a Date column. The
 * totals line has nothing to put under it — but an empty cell is not nothing
 * on a phone, where every cell becomes its own labelled line in the card.
 */
test('the receipts total leaves no empty cell under the dates', async ({ page }) => {
  await openPaymentLink(page, { dateTheFirstReceipt: true })
  await disclosure(page).click()

  const receipts = page.getByRole('region', { name: 'What the driver paid' })
  await expect(receipts.getByRole('columnheader', { name: 'Date' })).toBeVisible()
  // Written the way every other date on this page is written, not as ISO.
  await expect(receipts.getByRole('cell', { name: '14 Aug' })).toBeVisible()
  await expect(receipts.getByRole('row', { name: /Receipts in total/ }).getByRole('cell')).toHaveCount(2)
})

test('a person can see what makes up their own amount', async ({ page }) => {
  await openPaymentLink(page)
  await disclosure(page).click()

  const row = page.getByRole('region', { name: 'Your share' }).getByRole('row', { name: /Terka/ })
  await expect(row).toContainText('804,32 Kč')
  await expect(row).toContainText('804 Kč')
  // The litres she was actually aboard for.
  await expect(row).toContainText('L')
})

/**
 * A trip with upkeep and a toll on it. The example trip has neither, and the
 * bill only grows its parts — and the columns that go with them — when there
 * is more than fuel in it.
 */
async function openLinkForTripWithExtras(page: Page) {
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
  await page.getByLabel('Kč per L').fill('40')
  await page.getByLabel('Kč per km, car costs').fill('2')
  await page.getByRole('button', { name: 'Add a drive' }).click()
  await page.getByLabel('Distance km').fill('100')

  await page.getByRole('button', { name: 'Assign' }).click()
  await page.getByRole('button', { name: 'Everyone', exact: true }).click()

  await page.getByRole('button', { name: 'Split' }).click()
  await addExpense(page, 'Motorway toll', '300', 'Extra')

  await page.getByRole('button', { name: 'Collect' }).click()
  await page.getByLabel('Your Revolut handle').fill('mattsivak')
  await page.waitForResponse(
    (response) => response.url().includes('/api/trips/') && response.request().method() === 'PUT',
  )

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: 'Copy the payment link' }).click()
  const link = await page.evaluate(() => navigator.clipboard.readText())
  await page.goto(link)
  await expect(page.getByRole('link', { name: /^Pay / }).first()).toBeVisible()
}

test('upkeep and tolls are named on the bill, not folded into the fuel', async ({ page }) => {
  await openLinkForTripWithExtras(page)
  await disclosure(page).click()

  const bill = page.getByRole('region', { name: 'The bill' })
  // 100 km at 2 Kč, and the toll as entered.
  await expect(bill).toContainText('Car costs')
  await expect(bill).toContainText('200,00 Kč')
  await expect(bill).toContainText('Extras')
  await expect(bill).toContainText('300,00 Kč')
  await expect(bill).toContainText('Total')

  const costs = page.getByRole('region', { name: 'Extras' })
  await expect(costs.getByRole('cell', { name: 'Motorway toll' })).toBeVisible()

  // And each person's amount is shown split the same three ways.
  const share = page.getByRole('region', { name: 'Your share' })
  await expect(share.getByRole('columnheader', { name: 'Car' })).toBeVisible()
  await expect(share.getByRole('columnheader', { name: 'Extras' })).toBeVisible()
  await expect(share.getByRole('row', { name: /Janca/ })).toContainText('150,00 Kč')
})

/**
 * The calculator can know that money is missing from the total — a receipt in
 * a currency with no rate, fuel with nobody to charge it to. The owner is told.
 * The people being asked to pay were told nothing at all.
 */
test('a trip that is missing something says so on the page it sends out', async ({ page }) => {
  await stubPrice(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Open the example trip' }).click()
  await expect(page.getByRole('heading', { name: 'Where the car went' })).toBeVisible()

  await page.getByRole('button', { name: 'Split' }).click()
  await page.getByText('Set a price per L').click()
  await page.getByLabel('Kč per L').fill('0')
  await expect(page.getByText(/Set a price per/).first()).toBeVisible()

  await page.getByRole('button', { name: 'Collect' }).click()
  await page.getByLabel('Your Revolut handle').fill('mattsivak')
  await page.waitForResponse(
    (response) => response.url().includes('/api/trips/') && response.request().method() === 'PUT',
  )
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: 'Copy the payment link' }).click()
  await page.goto(await page.evaluate(() => navigator.clipboard.readText()))

  await expect(page.getByRole('heading', { name: 'Volkswagen August trip' })).toBeVisible()
  await expect(page.getByText(/Set a price per/)).toBeVisible()
})
