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
