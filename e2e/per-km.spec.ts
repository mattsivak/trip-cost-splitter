import { expect, test, type Page } from '@playwright/test'

/**
 * Pricing by the kilometre: no fuel is counted at all, and wear on the car can
 * be charged alongside whatever the driving costs. The price endpoint is
 * stubbed for the same reason it is everywhere else.
 */
async function stubLocalPrice(page: Page) {
  await page.route('**/api/pricing/local**', async (route) => {
    await route.fulfill({
      json: {
        price: {
          country: 'CZ',
          countryName: 'Czech Republic',
          currency: 'CZK',
          energyKind: 'gasoline',
          pricePerUnit: 40,
          convertedFromGallons: false,
          fetchedAt: '2026-08-22T08:50:59+03:00',
        },
        country: 'CZ',
        reason: null,
      },
    })
  })
}

const readoutOf = (page: Page) => page.getByRole('region', { name: 'Trip totals' })

/** Two people, one 100 km drive, and nothing decided about pricing yet. */
async function startTrip(page: Page) {
  await stubLocalPrice(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a trip' }).click()
  await expect(page.getByRole('heading', { name: 'Where the car went' })).toBeVisible()

  await page.getByRole('button', { name: 'People' }).click()
  for (const name of ['Matthew', 'Janca']) {
    await page.getByPlaceholder('Name').fill(name)
    await page.getByRole('button', { name: 'Add person' }).click()
  }

  await page.getByRole('button', { name: 'Route' }).click()
  await page.getByRole('button', { name: 'Add a drive' }).click()
  await page.getByLabel('Distance km').fill('100')

  await page.getByRole('button', { name: 'Assign' }).click()
  await page.getByRole('button', { name: 'Everyone', exact: true }).click()
}

/** Switch to the per-km basis and set both rates. */
async function priceByKm(page: Page, rate: string, upkeep: string) {
  await page.getByRole('button', { name: 'Split' }).click()
  await page.getByText('Set a price per km').click()
  await page.getByLabel('Kč per km', { exact: true }).fill(rate)
  await page.getByLabel('Kč per km, upkeep').fill(upkeep)
}

test('the driving is charged at the stated rate, with upkeep on top', async ({ page }) => {
  await startTrip(page)
  await priceByKm(page, '4', '2')

  const readout = readoutOf(page)
  await expect(readout).toContainText('4,00 Kč/km')
  await expect(readout).toContainText('plus 2,00 Kč/km upkeep')
  // 100 km at 4 Kč, plus 100 km of wear at 2 Kč.
  await expect(readout).toContainText('600 Kč')
})

test('no fuel is counted, so no litre figure is quoted anywhere', async ({ page }) => {
  await startTrip(page)
  await priceByKm(page, '4', '0')

  const readout = readoutOf(page)
  await expect(readout).toContainText('4,00 Kč/km')
  await expect(readout).not.toContainText(' L')
  await expect(page.getByText('Charged by the kilometre, so no fuel is counted')).toBeVisible()

  // The consumption figure is not asked for either.
  await page.getByRole('button', { name: 'Route' }).click()
  await expect(page.getByLabel('Consumption L/100 km')).toHaveCount(0)
})

test('the message for the group chat names the wear and tear separately', async ({ page }) => {
  await startTrip(page)
  await priceByKm(page, '4', '2')

  await expect(page.getByText('100 km · 600 Kč total')).toBeVisible()
  await expect(page.getByText('Of which 200 Kč is wear and tear on the car.')).toBeVisible()
})

test('upkeep is charged on the consumption basis too', async ({ page }) => {
  await startTrip(page)

  await page.getByRole('button', { name: 'Route' }).click()
  await page.getByLabel('Kč per L').fill('40')
  await page.getByLabel('Consumption L/100 km').fill('10')
  await page.getByLabel('Kč per km, upkeep').fill('2')

  const readout = readoutOf(page)
  // 10 L at 40 Kč, plus 100 km of wear at 2 Kč.
  await expect(readout).toContainText('600 Kč')
  await expect(readout).toContainText('10,0 L')
})

test('an upkeep column appears in the split only once some is charged', async ({ page }) => {
  await startTrip(page)
  await page.getByRole('button', { name: 'Split' }).click()
  await expect(page.getByRole('columnheader', { name: 'Upkeep' })).toHaveCount(0)

  await page.getByLabel('Kč per km, upkeep').fill('2')
  await expect(page.getByRole('columnheader', { name: 'Upkeep' })).toBeVisible()
})

test('an idle stop is priced as money when the trip is priced per km', async ({ page }) => {
  await startTrip(page)
  await priceByKm(page, '4', '0')

  await page.getByRole('button', { name: 'Route' }).click()
  await page.getByRole('button', { name: 'Add an idle stop after this' }).click()
  await page.getByLabel('Kč it cost').fill('120')

  await page.getByRole('button', { name: 'Assign' }).click()
  for (const button of await page.getByRole('button', { name: 'Everyone', exact: true }).all()) {
    await button.click()
  }

  // 100 km at 4 Kč, plus the 120 Kč the waiting cost.
  await expect(readoutOf(page)).toContainText('520 Kč')
})

test('switching back to a price per litre restores the fuel figures', async ({ page }) => {
  await startTrip(page)
  await priceByKm(page, '4', '0')

  await page.getByRole('button', { name: 'Split' }).click()
  await page.getByText('Set a price per L').click()
  await page.getByLabel('Kč per L').fill('40')

  const readout = readoutOf(page)
  // Back to the trip's own consumption figure, which was never discarded.
  await expect(readout).toContainText('7,0 L')
  await expect(readout).toContainText('280 Kč')
})
