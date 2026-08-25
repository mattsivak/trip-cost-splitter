import { expect, test, type Page } from '@playwright/test'

/**
 * The plug-in hybrid case: the car draws on two things at once, and the
 * battery charged at home overnight is not something the passengers should be
 * paying for. The pricing endpoint is stubbed for the same reason it is
 * everywhere else — this is about what the app does with an answer.
 */
async function stubLocalPrice(page: Page, answer: unknown) {
  await page.route('**/api/pricing/local**', async (route) => {
    await route.fulfill({ json: answer })
  })
}

const czechPetrol = {
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
}

const readoutOf = (page: Page) => page.getByRole('region', { name: 'Trip totals' })

/**
 * A two-person trip that has run 100 km on 6 L of petrol and 15 kWh of
 * battery. Leaves the browser on the route step, where both figures live.
 */
async function startHybrid(page: Page) {
  await stubLocalPrice(page, czechPetrol)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a trip' }).click()
  await expect(page.getByRole('heading', { name: 'Where the car went' })).toBeVisible()

  await page.getByRole('button', { name: 'People' }).click()
  for (const name of ['Matthew', 'Janca']) {
    await page.getByPlaceholder('Name').fill(name)
    await page.getByRole('button', { name: 'Add person' }).click()
  }

  await page.getByRole('button', { name: 'Route' }).click()

  // Electricity has no national price to look up, so nothing is prefilled.
  await stubLocalPrice(page, { price: null, country: 'CZ', reason: 'no-national-price' })
  await page.getByRole('button', { name: 'Add another energy source' }).click()
  await expect(page.getByLabel('Also runs on')).toHaveValue('electric')

  await page.getByLabel('Kč per L').fill('40')
  await page.getByLabel('Petrol L/100 km').fill('6')
  await page.getByLabel('Electric kWh/100 km').fill('15')

  await page.getByRole('button', { name: 'Add a drive' }).click()
  await page.getByLabel('Distance km').fill('100')

  // Without occupants the fuel belongs to nobody and the trip totals nothing.
  await page.getByRole('button', { name: 'Assign' }).click()
  await page.getByRole('button', { name: 'Everyone', exact: true }).click()
  await page.getByRole('button', { name: 'Route' }).click()
}

test('a second energy source starts out counted but not charged for', async ({ page }) => {
  await startHybrid(page)

  await expect(page.getByLabel('Bill the petrol')).toBeChecked()
  await expect(page.getByLabel('Bill the electric')).not.toBeChecked()
  await expect(page.getByText('The electric is still counted and still shown')).toBeVisible()
})

test('both units are counted, and only the petrol is charged out', async ({ page }) => {
  await startHybrid(page)

  const readout = readoutOf(page)
  await expect(readout).toContainText('6,0 L + 15,0 kWh')
  await expect(readout).toContainText('kWh not billed')
  // 6 L at 40 Kč. The 15 kWh came off a battery charged at home.
  await expect(readout).toContainText('240 Kč')
})

test('billing the electricity adds it to the total', async ({ page }) => {
  await startHybrid(page)

  await page.getByLabel('Bill the electric').check()
  await page.getByLabel('Kč per kWh').fill('6')

  const readout = readoutOf(page)
  // 240 Kč of petrol plus 15 kWh at 6 Kč.
  await expect(readout).toContainText('330 Kč')
  await expect(readout).not.toContainText('kWh not billed')
})

test('a leg on the battery can say so, without touching the rest of the trip', async ({ page }) => {
  await startHybrid(page)
  const readout = readoutOf(page)

  // This leg ran mostly on the battery, so the engine only sipped.
  await page.getByLabel(/^Petrol consumption for/).fill('2')
  await expect(readout).toContainText('2,0 L + 15,0 kWh')
  await expect(readout).toContainText('80 Kč')

  // Clearing the override hands the leg back to the trip-wide figure.
  await page.getByLabel(/^Petrol consumption for/).fill('')
  await expect(readout).toContainText('6,0 L + 15,0 kWh')
  await expect(readout).toContainText('240 Kč')
})

test('the message for the group chat says the battery is not being charged for', async ({ page }) => {
  await startHybrid(page)

  await page.getByRole('button', { name: 'Split' }).click()
  await expect(page.getByText('The 15,0 kWh is not being charged to anyone.')).toBeVisible()
})

test('dropping back to one energy source leaves the trip billable again', async ({ page }) => {
  await startHybrid(page)

  await page.getByRole('button', { name: 'Stop counting electric' }).click()

  await expect(page.getByLabel('Runs on')).toHaveValue('gasoline')
  await expect(page.getByLabel('Bill the petrol')).toHaveCount(0)

  const readout = readoutOf(page)
  await expect(readout).toContainText('6,0 L')
  await expect(readout).not.toContainText('kWh')
})
