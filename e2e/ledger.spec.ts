import { expect, test } from '@playwright/test'
import { addDrive, addPeople, addPurchase, goTo, lineOf, person, startTrip } from './support/trip'

/**
 * The trip as one ordered ledger.
 *
 * Drives, stops and money used to live in three lists that could not
 * interleave, so a coffee bought between two drives had nowhere to sit in the
 * order it happened. And every screen asked what a thing cost and who it was
 * for at the same time, which is what made them long.
 */

test('drives and purchases sit in one list, in trip order', async ({ page }) => {
  await startTrip(page)
  await addPeople(page, ['Matthew', 'Janca'])

  await addDrive(page, 'Šumperk', 'Olomouc', '60')
  await addPurchase(page, 'Coffee', '120')
  await addDrive(page, 'Olomouc', 'Brno', '80')

  await expect(page.locator('.ledger__line')).toHaveCount(3)
  await expect(page.locator('.ledger__line').nth(1)).toContainText('pays for the driving')
})

test('a line can be moved through the order', async ({ page }) => {
  await startTrip(page)
  await addDrive(page, 'A', 'B', '10')
  await addPurchase(page, 'Coffee', '120')

  await page
    .locator('.ledger__line')
    .last()
    .getByRole('button', { name: /Move Coffee up/ })
    .click()

  await expect(page.locator('.ledger__line').first()).toHaveAttribute('aria-label', 'Coffee')
})

test('the route step never asks who was in the car', async ({ page }) => {
  await startTrip(page)
  await addPeople(page, ['Matthew', 'Janca'])
  await addDrive(page, 'A', 'B', '10')

  // People are the next step's business. Nothing here should name one.
  await expect(page.getByRole('button', { name: 'Everyone', exact: true })).toHaveCount(0)
  await expect(page.locator('.ledger').getByText('Janca')).toHaveCount(0)
})

test('a purchase either pays for the driving or is shared', async ({ page }) => {
  await startTrip(page)
  await addPeople(page, ['Matthew', 'Janca'])
  await addDrive(page, 'A', 'B', '100')
  await goTo(page, 'Who pays')
  await page.getByRole('button', { name: 'Everyone', exact: true }).first().click()

  await goTo(page, 'Route')
  await page.getByText('From the receipts').click()
  await addPurchase(page, 'The tank', '600', true)

  await goTo(page, 'Settle up')
  await expect(person(page, 'Janca')).toContainText('300 Kč')
})

test('a drive can be priced by hand instead of by the fuel', async ({ page }) => {
  await startTrip(page)
  await addPeople(page, ['Matthew', 'Janca'])
  const line = await addDrive(page, 'A', 'B', '100')

  await line.getByLabel(/How .* is priced/).selectOption('money')
  await line.getByLabel('Kč it cost').fill('500')
  await expect(line).toContainText('priced by hand')

  await goTo(page, 'Who pays')
  await page.getByRole('button', { name: 'Everyone', exact: true }).first().click()

  await goTo(page, 'Settle up')
  await expect(person(page, 'Janca')).toContainText('250 Kč')
})

test('a drive can carry its own rate per kilometre', async ({ page }) => {
  await startTrip(page)
  await addPeople(page, ['Matthew', 'Janca'])
  const line = await addDrive(page, 'A', 'B', '100')

  await line.getByLabel(/How .* is priced/).selectOption('per-km')
  await line.getByLabel('Kč per km').fill('4')

  await goTo(page, 'Who pays')
  await page.getByRole('button', { name: 'Everyone', exact: true }).first().click()

  await goTo(page, 'Settle up')
  await expect(person(page, 'Janca')).toContainText('200 Kč')
})

test('who pays asks one question per line and nothing else', async ({ page }) => {
  await startTrip(page)
  await addPeople(page, ['Matthew', 'Janca'])
  await addDrive(page, 'A', 'B', '100')
  await addPurchase(page, 'Toll', '200')

  await goTo(page, 'Who pays')

  // The drive asks who was aboard; the purchase asks whose money it was.
  await expect(lineOf(page, 'A → B').getByRole('button', { name: 'Everyone', exact: true })).toBeVisible()
  await expect(lineOf(page, 'Toll').locator('.who__payers label.toggle')).toHaveCount(2)
  // And no distances or amounts to edit — that was the step before.
  await expect(lineOf(page, 'A → B').getByLabel('Distance km')).toHaveCount(0)
})

/**
 * The date exists to pick a day's exchange rate. On a purchase in the trip's
 * own currency it answers a question nobody asked, and it was the widest thing
 * on the row.
 */
test('a purchase in the trip’s own currency asks for no date', async ({ page }) => {
  await startTrip(page)
  const line = await addPurchase(page, 'Parking Vienna', '100')

  await expect(line.getByLabel('Date')).toHaveCount(0)
})

test('a purchase in another currency asks for the day its rate belongs to', async ({ page }) => {
  await page.route('**/api/fx/rate**', (route) =>
    route.fulfill({
      json: {
        rate: {
          base: 'EUR',
          quote: 'CZK',
          rate: 24.21,
          date: '2026-08-14',
          fetchedAt: '2026-08-25T10:00:00.000Z',
        },
        reason: null,
      },
    }),
  )
  await startTrip(page)
  const line = await addPurchase(page, 'Parking Vienna', '4')
  await line.getByLabel('Paid in').selectOption('EUR')

  await expect(line.getByLabel('Date')).toBeVisible()
})

test('the fuel toggle says what it means', async ({ page }) => {
  await startTrip(page)
  const line = await addPurchase(page, 'The tank', '600')

  await expect(line.locator('label.toggle', { hasText: 'pays for the driving' })).toHaveAttribute(
    'title',
    /fuel/i,
  )
})

/**
 * Money marked as paying for the driving funds the pool the legs are charged
 * against. On a trip priced per litre there is no pool to fund, so the money
 * changes nobody's bill — which is invisible unless the row says so.
 */
test('a purchase that funds the driving says when it is not being divided', async ({ page }) => {
  await startTrip(page)
  await addPeople(page, ['Matthew', 'Janca'])
  await addDrive(page, 'A', 'B', '100')
  const line = await addPurchase(page, 'Parking Vienna', '100', true)

  await expect(line).toContainText('not split')

  await page.locator('.pricing').getByText('From the receipts').click()
  await expect(line).not.toContainText('not split')
})
