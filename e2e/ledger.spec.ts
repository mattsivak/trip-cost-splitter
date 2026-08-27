import { expect, test, type Page } from '@playwright/test'
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
  await addPurchase(page, 'Coffee', '120', false)
  await addDrive(page, 'Olomouc', 'Brno', '80')

  await expect(page.locator('.ledger__line')).toHaveCount(3)
  await expect(page.locator('.ledger__line').nth(1)).toContainText('Shared')
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

/**
 * Money marked as paying for the driving funds the pool the legs are charged
 * against. On a trip priced per litre there is no pool to fund, so the money
 * changes nobody's bill — which is invisible unless the row says so.
 */
test('every purchase says what will happen to the money', async ({ page }) => {
  await startTrip(page)
  await addPeople(page, ['Matthew', 'Janca'])
  await addDrive(page, 'A', 'B', '100')

  // Shared: divided between the people it was for.
  const toll = await addPurchase(page, 'Parking Vienna', '100', false)
  await expect(toll).toContainText('split evenly between everyone')

  // Fuel: charged by who was in the car, but only where the receipts set the
  // price. Priced per litre there is no pot to fill, and it says so.
  const tank = await addPurchase(page, 'The tank', '600', true)
  await expect(tank).toContainText('not split')

  await page.locator('.pricing').getByText('From the receipts').click()
  await expect(tank).toContainText('charged by who was in the car')
})

/** Most of what gets added to a fuel-splitting app is fuel. */
test('a new purchase starts as fuel', async ({ page }) => {
  await startTrip(page)
  await goTo(page, 'Route')
  await page.getByRole('button', { name: 'Add a purchase' }).click()

  const kinds = page.locator('.ledger__line').last().locator('.ledger__kind label.toggle')
  await expect(kinds.filter({ hasText: 'Fuel' })).toHaveClass(/is-on/)
  await expect(kinds.filter({ hasText: 'Shared' })).not.toHaveClass(/is-on/)
})

test('the choice is about what you bought, not about the arithmetic', async ({ page }) => {
  await startTrip(page)
  const line = await addPurchase(page, 'Parking Vienna', '100', false)

  const kinds = line.locator('.ledger__kind label.toggle')
  await expect(kinds).toHaveCount(2)
  await expect(kinds.first()).toContainText('Fuel')
  await expect(kinds.last()).toContainText('Shared')
  await expect(kinds.last()).toHaveClass(/is-on/)
})

/**
 * Dragging a line by its handle.
 *
 * Two things make this fiddlier than it looks. Playwright only turns on
 * Chromium's drag interception inside `dragTo`, and without it no dragover is
 * ever delivered. But `dragTo` also jumps the cursor in one hop, so Chromium
 * begins the drag over the *target* and the source never moves. So: a
 * throwaway drag onto itself arms interception, then the moves below start at
 * the handle and walk to the target.
 */
async function dragLine(page: Page, from: number, to: number) {
  const lines = page.locator('.ledger__line')
  const handle = lines.nth(from).locator('.ledger__grip')

  await handle.dragTo(handle)

  const source = await handle.boundingBox()
  const target = await lines.nth(to).boundingBox()
  if (!source || !target) throw new Error('a line is not on screen to drag')

  const [sx, sy] = [source.x + source.width / 2, source.y + source.height / 2]
  const [tx, ty] = [target.x + target.width / 2, target.y + target.height / 2]

  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx + 4, sy + 4)
  await page.mouse.move(tx, ty, { steps: 20 })
  await page.mouse.move(tx, ty + 1)
  await page.mouse.up()
}

test('a line can be dragged into a new place by its handle', async ({ page }) => {
  await startTrip(page)
  await addDrive(page, 'A', 'B', '10')
  await addDrive(page, 'B', 'C', '20')
  await addPurchase(page, 'Coffee', '120')

  await dragLine(page, 2, 0)

  await expect(page.locator('.ledger__line').first()).toHaveAttribute('aria-label', 'Coffee')
})

test('the line follows the cursor, so you can see where it will land', async ({ page }) => {
  await startTrip(page)
  await addDrive(page, 'A', 'B', '10')
  await addPurchase(page, 'Coffee', '120')

  const lines = page.locator('.ledger__line')
  const handle = lines.nth(1).locator('.ledger__grip')
  await handle.dragTo(handle)

  const source = await handle.boundingBox()
  const target = await lines.nth(0).boundingBox()
  await page.mouse.move(source!.x + 5, source!.y + 5)
  await page.mouse.down()
  await page.mouse.move(source!.x + 9, source!.y + 9)
  await page.mouse.move(target!.x + target!.width / 2, target!.y + 4, { steps: 20 })
  await page.mouse.move(target!.x + target!.width / 2, target!.y + 5)

  // Mid-drag, before the drop: the ledger already shows the new order.
  await expect(lines.first()).toHaveAttribute('aria-label', 'Coffee')
  await page.mouse.up()
})
