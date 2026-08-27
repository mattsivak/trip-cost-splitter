import { expect, test, type Page } from '@playwright/test'
import { addDrive, addPeople, addPurchase, everyoneAboard, goTo } from './support/trip'

/** One expense, named and priced. `kind` moves it out of fuel into extras. */
/** The tappable "split · who paid" line that opens an expense. */
/**
 * Amounts paid in another currency. The rate feed is stubbed for the same
 * reason every other outbound call is: a spec must not fail because a bank
 * holiday moved a number.
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

/** 24,21 Kč to the euro, as of a Friday. */
async function stubRate(page: Page, rate = 24.21, date = '2026-08-14') {
  await page.route('**/api/fx/rate**', async (route) => {
    await route.fulfill({
      json: {
        rate: { base: 'EUR', quote: 'CZK', rate, date, fetchedAt: '2026-08-25T10:00:00.000Z' },
        reason: null,
      },
    })
  })
}

/** A rate the feed does not carry. */
async function stubNoRate(page: Page) {
  await page.route('**/api/fx/rate**', async (route) => {
    await route.fulfill({ json: { rate: null, reason: 'no-rate' } })
  })
}

const readoutOf = (page: Page) => page.getByRole('region', { name: 'Trip totals' })

/** Two people, one 100 km drive, priced from the receipts. */
async function startTrip(page: Page) {
  await stubLocalPrice(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a trip' }).click()
  await expect(page.getByRole('heading', { name: 'Who came along' })).toBeVisible()
  await addPeople(page, ['Matthew', 'Janca'])
  await addDrive(page, 'A', 'B', '100')
  await everyoneAboard(page)
  await goTo(page, 'Route')
}

test('a receipt in euros is converted at the rate for its day', async ({ page }) => {
  await stubRate(page)
  await startTrip(page)

  const line = await addPurchase(page, 'Fuel', '0', true)
  // The date belongs to the rate, so it appears with the foreign amount.
  await line.getByLabel('Paid in').selectOption('EUR')
  await line.getByLabel('Date').fill('2026-08-14')
  await line.getByLabel('Amount in EUR').fill('62.40')

  // 62,40 € at 24,21 is 1 510,70 Kč.
  await expect(page.getByText('= 1 510,70 Kč')).toBeVisible()
  await expect(page.getByText('ECB, 14. 8.')).toBeVisible()
})

test('the converted amount is what the split actually divides', async ({ page }) => {
  await stubRate(page)
  await startTrip(page)

  await page.locator('.pricing').getByText('From the receipts').click()
  const line = await addPurchase(page, 'Fuel', '0', true)
  await line.getByLabel('Paid in').selectOption('EUR')
  await line.getByLabel('Amount in EUR').fill('62.40')

  // The whole 1 510,70 Kč gets divided, so each of the two owes 755 Kč.
  await expect(readoutOf(page)).toContainText('1 511 Kč')
  await goTo(page, 'Settle up')
  await expect(page.getByText('Janca: 755 Kč')).toBeVisible()
})

test('typing your own rate drops the feed’s attribution', async ({ page }) => {
  await stubRate(page)
  await startTrip(page)

  const line = await addPurchase(page, 'Fuel', '0', true)
  await line.getByLabel('Paid in').selectOption('EUR')
  await line.getByLabel('Amount in EUR').fill('100')
  await expect(page.getByText('ECB, 14. 8.')).toBeVisible()

  // The trip shows its currency as a symbol, so the field is labelled with one.
  await page.getByLabel('Kč per EUR').fill('25')
  await expect(page.getByText('= 2 500,00 Kč')).toBeVisible()
  await expect(page.getByText('ECB, 14. 8.')).toHaveCount(0)
})

test('an amount with no rate is called out rather than counted as nothing', async ({ page }) => {
  await stubNoRate(page)
  await startTrip(page)

  const line = await addPurchase(page, 'Fuel', '0', true)
  await line.getByLabel('Paid in').selectOption('EUR')
  await line.getByLabel('Amount in EUR').fill('62.40')

  await expect(page.getByText('no rate — not being counted')).toBeVisible()
  await goTo(page, 'Settle up')
  await expect(page.getByText('is in EUR with no exchange rate')).toBeVisible()
})

test('tolls can be foreign too, and land in the split', async ({ page }) => {
  await stubRate(page)
  await startTrip(page)

  const overhead = await addPurchase(page, 'Motorway toll', '0', false)
  await overhead.getByLabel('Paid in').selectOption('EUR')
  await overhead.getByLabel('Amount in EUR').fill('12.40')

  // 12,40 € at 24,21 is 300,20 Kč, on top of the 280 Kč of fuel.
  await expect(page.getByText('= 300,20 Kč')).toBeVisible()
  await expect(readoutOf(page)).toContainText('580 Kč')
})

test('switching back to the trip’s own currency keeps the amount settled', async ({ page }) => {
  await stubRate(page)
  await startTrip(page)

  // Priced from the receipts, so the converted figure is the whole total.
  await page.locator('.pricing').getByText('From the receipts').click()
  const line = await addPurchase(page, 'Fuel', '0', true)
  await line.getByLabel('Paid in').selectOption('EUR')
  await line.getByLabel('Amount in EUR').fill('62.40')
  await expect(page.getByText('= 1 510,70 Kč')).toBeVisible()

  await line.getByLabel('Paid in').selectOption('CZK')
  // No longer a conversion: the figure that was reached stays as the amount.
  await expect(page.getByLabel('Paid in')).toHaveValue('CZK')
  await expect(page.getByText('= 1 510,70 Kč')).toHaveCount(0)
  await expect(readoutOf(page)).toContainText('1 511 Kč')
})
