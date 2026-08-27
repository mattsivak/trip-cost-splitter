import { expect, test, type Page } from '@playwright/test'

/**
 * A trip is one screen.
 *
 * Five steps in a line implied one pass in one direction. The real task is
 * fiddling: change a distance, move an occupant, add the toll you forgot, watch
 * the split move. Route and Assign were the same object drawn twice, so editing
 * one drive meant a round trip between screens; and the pricing mode, which
 * lived at step 4, silently rewrote step 1.
 */

async function stubPrice(page: Page) {
  await page.route('**/api/pricing/local**', (route) =>
    route.fulfill({ json: { price: null, country: null, reason: 'unknown-country' } }),
  )
}

async function openDemo(page: Page) {
  await stubPrice(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Open the example trip' }).click()
  await expect(page.getByRole('heading', { name: 'Where the car went' })).toBeVisible()
}

test('everything about a trip is on one page', async ({ page }) => {
  await openDemo(page)

  // No rail, no Back and Next: nothing to walk through.
  await expect(page.getByRole('navigation', { name: 'Steps' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Next' })).toHaveCount(0)

  for (const heading of ['The car', 'Who came along', 'Where the car went', 'What was spent', 'The split']) {
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
  }
})

test('a leg carries its distance and the people on it, in one card', async ({ page }) => {
  await openDemo(page)

  const leg = page.getByRole('group', { name: /Šumperk/ }).first()
  await expect(leg.getByLabel('Distance km')).toBeVisible()
  await expect(leg.locator('label.toggle').first()).toBeVisible()
  await expect(leg.locator('.litrebar')).toBeVisible()
})

test('taking somebody off a leg moves the split without leaving the page', async ({ page }) => {
  await openDemo(page)

  const terka = page.getByRole('group', { name: /'s share/ }).filter({ hasText: 'Terka' })
  const before = await terka.locator('.person__figure strong').textContent()

  const leg = page.getByRole('group', { name: /Šumperk/ }).first()
  await leg.locator('label.toggle').filter({ hasText: 'Terka' }).first().click()

  await expect(terka.locator('.person__figure strong')).not.toHaveText(before ?? '')
})

test('the price is set where the route can see it', async ({ page }) => {
  await openDemo(page)

  // Choosing per-km takes the consumption fields away from the legs; that is a
  // decision about the car, and it now sits above the route rather than two
  // screens after it.
  const car = page.getByRole('region', { name: 'The car' })
  await expect(car).toBeVisible()
  await expect(page.getByLabel('Consumption L/100 km')).toBeVisible()

  await car.getByText('Set a price per km').click()
  await expect(car.getByLabel('Kč per km, car costs')).toBeVisible()
  // The legs stop asking for litres the moment the car is priced by the km,
  // and you can see that happen without leaving the page.
  await expect(page.getByLabel('Consumption L/100 km')).toHaveCount(0)
})
