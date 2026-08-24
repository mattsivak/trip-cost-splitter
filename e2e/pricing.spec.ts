import { expect, test, type Page } from '@playwright/test'

/**
 * The pricing endpoint is stubbed throughout: these tests are about what the
 * app does with an answer, not about whether openvan.camp is up today.
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
    pricePerUnit: 40.95,
    convertedFromGallons: false,
    fetchedAt: '2026-08-22T08:50:59+03:00',
  },
  country: 'CZ',
  reason: null,
}

test('a new trip is priced per unit, prefilled from the local pump price', async ({ page }) => {
  await stubLocalPrice(page, czechPetrol)

  await page.goto('/')
  await page.getByRole('button', { name: 'Start a trip' }).click()
  await expect(page.getByRole('heading', { name: 'Where the car went' })).toBeVisible()

  // The price is settable in step 1, next to the consumption figure it belongs with.
  await expect(page.getByLabel('Kč per L')).toHaveValue('40.95')
  await expect(page.getByText('Local pump price · Czech Republic · petrol')).toBeVisible()

  await page.getByRole('button', { name: 'Split' }).click()
  await expect(page.getByLabel('Kč per L')).toHaveValue('40.95')
})

test('the same control appears in step 1 and step 4, and they stay in step', async ({ page }) => {
  await stubLocalPrice(page, czechPetrol)

  await page.goto('/')
  await page.getByRole('button', { name: 'Start a trip' }).click()
  await page.getByLabel('Kč per L').fill('37.5')

  await page.getByRole('button', { name: 'Split' }).click()
  await expect(page.getByLabel('Kč per L')).toHaveValue('37.5')
})

test('typing over the price drops the claim that it came from the feed', async ({ page }) => {
  await stubLocalPrice(page, czechPetrol)

  await page.goto('/')
  await page.getByRole('button', { name: 'Start a trip' }).click()
  await expect(page.getByText('Local pump price · Czech Republic')).toBeVisible()

  await page.getByLabel('Kč per L').fill('37.5')
  await expect(page.getByText('Local pump price · Czech Republic')).toHaveCount(0)
})

test('a new trip still opens when the price lookup finds nothing', async ({ page }) => {
  await stubLocalPrice(page, { price: null, country: null, reason: 'unknown-country' })

  await page.goto('/')
  await page.getByRole('button', { name: 'Start a trip' }).click()
  await expect(page.getByRole('heading', { name: 'Where the car went' })).toBeVisible()

  await expect(page.getByLabel('Kč per L')).toHaveValue('0')
})

test('a new trip still opens when the price lookup fails outright', async ({ page }) => {
  await page.route('**/api/pricing/local**', (route) => route.abort())

  await page.goto('/')
  await page.getByRole('button', { name: 'Start a trip' }).click()
  await expect(page.getByRole('heading', { name: 'Where the car went' })).toBeVisible()
})

test('choosing electric switches the whole trip to kWh', async ({ page }) => {
  await stubLocalPrice(page, czechPetrol)

  await page.goto('/')
  await page.getByRole('button', { name: 'Start a trip' }).click()

  await stubLocalPrice(page, { price: null, country: 'CZ', reason: 'no-national-price' })
  await page.getByLabel('Runs on').selectOption('electric')

  await expect(page.getByLabel('Kč per kWh')).toBeVisible()
  await expect(page.getByText('Charging prices vary more by where you plug in')).toBeVisible()
  await expect(page.getByLabel('Consumption kWh/100 km')).toBeVisible()
})

test('switching to diesel re-prices the trip', async ({ page }) => {
  await stubLocalPrice(page, czechPetrol)

  await page.goto('/')
  await page.getByRole('button', { name: 'Start a trip' }).click()

  await stubLocalPrice(page, {
    ...czechPetrol,
    price: { ...czechPetrol.price, energyKind: 'diesel', pricePerUnit: 44.41 },
  })
  await page.getByLabel('Runs on').selectOption('diesel')

  await expect(page.getByLabel('Kč per L')).toHaveValue('44.41')
  await expect(page.getByText('Czech Republic · diesel')).toBeVisible()
})

test('an empty trip is not scolded about receipts it does not have', async ({ page }) => {
  await stubLocalPrice(page, czechPetrol)

  await page.goto('/')
  await page.getByRole('button', { name: 'Start a trip' }).click()
  await page.getByRole('button', { name: 'Split' }).click()

  await expect(page.getByText('larger than the receipts on file')).toHaveCount(0)
})
