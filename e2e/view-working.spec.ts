import { expect, test, type Page } from '@playwright/test'
import {
  addDrive,
  addPeople,
  addPurchase,
  everyoneAboard,
  goTo,
  paymentLink,
  stubPrice,
} from './support/trip'

/** One expense, named and priced. `kind` moves it out of fuel into extras. */
/** The tappable "split · who paid" line that opens an expense. */
/** The example trip, published, and opened the way a recipient opens it. */
async function openPaymentLink(page: Page, options: { dateTheFirstReceipt?: boolean } = {}) {
  await stubPrice(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Open the example trip' }).click()
  await expect(page.getByRole('heading', { name: 'Who came along' })).toBeVisible()

  if (options.dateTheFirstReceipt) {
    await goTo(page, 'Route')
    await page.locator('.ledger__line--buy').first().getByLabel('Date').fill('2026-08-14')
  }
  const link = await paymentLink(page)

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
  await expect(page.getByRole('heading', { name: 'Who came along' })).toBeVisible()
  await addPeople(page, ['Matthew', 'Janca'])
  await goTo(page, 'Route')
  await page.getByLabel('Kč per L').fill('40')
  await page.getByLabel('Kč per km, car costs').fill('2')
  await addDrive(page, 'A', 'B', '100')
  await everyoneAboard(page)
  await addPurchase(page, 'Motorway toll', '300')
  const link = await paymentLink(page)
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
  await expect(page.getByRole('heading', { name: 'Who came along' })).toBeVisible()
  await goTo(page, 'Route')
  await page.locator('.pricing').getByText('Price per L').click()
  await goTo(page, 'Route')
  await page.getByLabel('Kč per L').fill('0')
  await goTo(page, 'Settle up')
  await expect(page.getByText(/Set a price per/).first()).toBeVisible()
  await page.goto(await paymentLink(page))

  await expect(page.getByRole('heading', { name: 'Volkswagen August trip' })).toBeVisible()
  await expect(page.getByText(/Set a price per/)).toBeVisible()
})
