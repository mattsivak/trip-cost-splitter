import { expect, test, type Page } from '@playwright/test'
import { addPurchase, goTo, openDemo, person } from './support/trip'

/**
 * Looking a route up, and keeping the ledger in the order things happened.
 *
 * The lookup replaces the drives. It must not replace the stops, which are the
 * user's own measurements, nor the purchases — and a stop belongs behind the
 * drive that arrived where it happened, not at the end of the list.
 */
async function stubRouting(page: Page, labels: string[]) {
  await page.route('**/api/routing/geocode**', async (route) => {
    const query = String((route.request().postDataJSON() as { query?: string })?.query ?? '')
    await route.fulfill({
      json: { results: [{ label: query, lat: 49.9 + labels.indexOf(query) / 10, lon: 17 }] },
    })
  })
  await page.route('**/api/routing/route**', async (route) => {
    const legs = labels.slice(0, -1).map((from, index) => ({
      fromLabel: from,
      toLabel: labels[index + 1],
      distanceKm: 50,
      durationSeconds: 3000,
    }))
    await route.fulfill({ json: { provider: 'osrm', legs, totalDistanceKm: legs.length * 50 } })
  })
}

const lineNames = (page: Page) => page.locator('.ledger__line')

test('a lookup lays the drives out in order', async ({ page }) => {
  await stubRouting(page, ['Šumperk', 'Olomouc', 'Milovice'])
  await openDemo(page)
  await goTo(page, 'Route')

  await page.getByRole('button', { name: 'Look up a route' }).click()
  await page.getByRole('button', { name: 'Look it up' }).click()
  await expect(page.getByText('2 drives via osrm')).toBeVisible()

  await expect(lineNames(page).nth(0)).toHaveAttribute('aria-label', 'Šumperk → Olomouc')
  await expect(lineNames(page).nth(1)).toHaveAttribute('aria-label', 'Olomouc → Milovice')
})

test('a lookup keeps the stops where they happened', async ({ page }) => {
  await stubRouting(page, ['Šumperk', 'Olomouc', 'Milovice'])
  await openDemo(page)
  await goTo(page, 'Route')

  await page.getByRole('button', { name: 'Look up a route' }).click()
  await page.getByRole('button', { name: 'Look it up' }).click()
  await expect(page.getByText('2 drives via osrm')).toBeVisible()

  // The canister was burned waiting at Milovice, and still is.
  await expect(page.locator('.ledger__line--stop')).toHaveCount(1)
})

test('a lookup leaves the money alone', async ({ page }) => {
  await stubRouting(page, ['Šumperk', 'Olomouc'])
  await openDemo(page)
  await addPurchase(page, 'Motorway toll', '300')

  await page.getByRole('button', { name: 'Look up a route' }).click()
  await page.getByRole('button', { name: 'Look it up' }).click()
  await expect(page.getByText('1 drives via osrm')).toBeVisible()

  await expect(page.getByRole('group', { name: 'Motorway toll' })).toBeVisible()
})

test('the split still reconciles after the route is reshaped', async ({ page }) => {
  await stubRouting(page, ['Šumperk', 'Olomouc', 'Milovice'])
  await openDemo(page)
  await goTo(page, 'Route')

  await page.getByRole('button', { name: 'Look up a route' }).click()
  await page.getByRole('button', { name: 'Look it up' }).click()
  await expect(page.getByText('2 drives via osrm')).toBeVisible()

  await goTo(page, 'Settle up')
  await expect(page.getByText(/Collect |Nothing to collect/)).toBeVisible()
  await expect(person(page, 'Matthew')).toBeVisible()
})
