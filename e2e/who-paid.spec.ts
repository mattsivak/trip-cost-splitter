import { expect, test, type Page } from '@playwright/test'
import {
  addDrive,
  addPeople,
  addPurchase,
  everyoneAboard,
  goTo,
  paidBy,
  paymentLink,
  person,
  stubPrice,
  workingOf,
} from './support/trip'

/**
 * Money somebody other than the driver put down.
 *
 * The app had a rich vocabulary for who owes and none at all for who paid:
 * every receipt and every toll was the driver's, and a passenger who bought
 * the second tank had to do the arithmetic in their head — which is the one
 * thing this app exists to abolish.
 */

/**
 * Two people, 100 km, priced from the receipts. Matthew drives; the whole bill
 * is one 400 tank, so each of them owes 200 of it.
 */
async function tripPricedFromReceipts(page: Page) {
  await stubPrice(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a trip' }).click()
  await expect(page.getByRole('heading', { name: 'Who came along' })).toBeVisible()

  await addPeople(page, ['Matthew', 'Janca'])
  await addDrive(page, 'A', 'B', '100')
  await everyoneAboard(page)

  await goTo(page, 'Route')
  await page.locator('.pricing').getByText('From the receipts').click()
  await addPurchase(page, 'The tank', '400', true)
}

test('a purchase can be put in somebody else’s name', async ({ page }) => {
  await tripPricedFromReceipts(page)

  // Unmarked, it is the driver's money, exactly as it always was.
  await goTo(page, 'Settle up')
  await expect(await workingOf(page, 'Matthew')).toContainText('Already paid')
  await expect(await workingOf(page, 'Janca')).not.toContainText('Already paid')

  await paidBy(page, 'The tank', 'Janca')

  await goTo(page, 'Settle up')
  await expect(await workingOf(page, 'Janca')).toContainText('400,00 Kč')
})

test('somebody who laid out more than their share is owed the difference', async ({ page }) => {
  await tripPricedFromReceipts(page)
  await paidBy(page, 'The tank', 'Janca')

  // Janca owes 200 of the tank and paid 400, so 200 comes back to her.
  await goTo(page, 'Settle up')
  await expect(person(page, 'Janca')).toContainText('200 Kč')
  await expect(person(page, 'Janca')).toContainText('gets back')
})

test('the person who is owed money is not asked to pay any', async ({ page }) => {
  await tripPricedFromReceipts(page)
  await paidBy(page, 'The tank', 'Janca')

  await goTo(page, 'Settle up')
  await page.getByLabel('Your Revolut handle').fill('mattsivak')

  await expect(page.getByRole('link', { name: /^Pay .*Janca/ })).toHaveCount(0)
  const back = page.locator('.settle-back')
  await expect(back).toContainText('sends back')
  await expect(back).toContainText('Janca')
})

test('the shared page says whose money each purchase was', async ({ page }) => {
  await tripPricedFromReceipts(page)
  await paidBy(page, 'The tank', 'Janca')

  await page.goto(await paymentLink(page))
  await page.locator('summary', { hasText: /worked out/i }).click()

  const receipts = page.getByRole('region', { name: 'What was already paid' })
  await expect(receipts.getByRole('row', { name: /The tank/ })).toContainText('Janca')
})

test('the driver is in the payer list once, already chosen', async ({ page }) => {
  await tripPricedFromReceipts(page)
  await goTo(page, 'Who pays')

  const payers = page.getByRole('group', { name: 'The tank' }).locator('.who__payers label.toggle')
  await expect(payers.filter({ hasText: 'Matthew' })).toHaveCount(1)
  await expect(payers.filter({ hasText: 'Matthew' })).toHaveClass(/is-on/)
})
