import { expect, test, type Locator, type Page } from '@playwright/test'
import { addDrive, addPeople, addPurchase, everyoneAboard, goTo, paidBy, stubPrice } from './support/trip'

/**
 * The split, as one line per person.
 *
 * It was an eight-column table — Person, Fuel, Car, Extras, Their share,
 * Already paid, To pay, Balance — to deliver one number each. Six of those
 * columns are working, not answer, and on a phone every row became a card of
 * seven labelled lines with the only number that matters last.
 */

/** One expense, named and priced. `kind` moves it out of fuel into extras. */
/**
 * Two people, 100 km, priced from one 600 tank so each owes 300 of it, and a
 * toll of 100 so the bill has more than one part to it.
 */
async function tripWithTwo(page: Page) {
  await stubPrice(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a trip' }).click()
  await expect(page.getByRole('heading', { name: 'Who came along' })).toBeVisible()
  await addPeople(page, ['Matthew', 'Janca'])
  await addDrive(page, 'A', 'B', '100')
  await everyoneAboard(page)
  await goTo(page, 'Route')
  await page.locator('.pricing').getByText('From the receipts').click()
  await addPurchase(page, 'The tank', '600', true)
  await addPurchase(page, 'Motorway toll', '100')
}

const person = (page: Page, name: string): Locator => page.getByRole('group', { name: `${name}'s share` })

test('a person is a name, one figure and a verb', async ({ page }) => {
  await tripWithTwo(page)

  await goTo(page, 'Settle up')
  const janca = person(page, 'Janca')
  // 300 of the tank and 50 of the toll, and she has paid for none of it.
  await expect(janca).toContainText('350 Kč')
  await expect(janca).toContainText('sends')
})

test('the figure is what actually changes hands, not what was billed', async ({ page }) => {
  await tripWithTwo(page)

  await paidBy(page, 'The tank', 'Janca')

  // Janca laid out 600 and owes 350 of the bill: 250 comes back to her.
  await goTo(page, 'Settle up')
  const janca = person(page, 'Janca')
  await expect(janca).toContainText('250 Kč')
  await expect(janca).toContainText('gets back')
})

test('the working for one person opens on their own line', async ({ page }) => {
  await tripWithTwo(page)

  await goTo(page, 'Settle up')
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
  await addPeople(page, ['Matthew', 'Janca', 'Terka'])
  await addDrive(page, 'A', 'B', '100')
  await everyoneAboard(page)
  await goTo(page, 'Route')
  await page.locator('.pricing').getByText('From the receipts').click()
  // 100,50 into three does not go, and somebody has to carry the difference.
  await addPurchase(page, 'The tank', '100.50', true)

  await goTo(page, 'Settle up')
  await expect(person(page, 'Matthew')).toContainText('rounding')
})

test('the collection is a sentence, not a totals row', async ({ page }) => {
  await tripWithTwo(page)

  await goTo(page, 'Settle up')
  await expect(page.getByText(/Collect 350 Kč/)).toBeVisible()
  await expect(page.getByRole('row', { name: /Total/ })).toHaveCount(0)
})
