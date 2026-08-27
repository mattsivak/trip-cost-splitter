import { expect, test, type Locator, type Page } from '@playwright/test'

/** One expense, named and priced. `kind` moves it out of fuel into extras. */
async function addExpense(page: Page, label: string, amount: string, kind: 'Fuel' | 'Extra' = 'Fuel') {
  await page.getByRole('button', { name: 'Add an expense' }).click()
  const row = page.locator('.expense').last()
  await row.getByLabel('What it was for').fill(label)
  await row.getByLabel('Amount').fill(amount)
  if (kind === 'Extra') {
    await openSentence(row)
    await row.locator('label.toggle', { hasText: 'Extra' }).click()
    // Leave it shut either way, so a test that opens it finds it closed.
    await row.getByRole('button', { name: 'Done' }).click()
  }
  return row
}

/** The tappable "split · who paid" line that opens an expense. */
async function openSentence(row: Locator) {
  await row
    .getByRole('button', { name: /Fuel for the whole trip|Split evenly|Set for each|Charged to/ })
    .click()
}

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

  await page.getByRole('button', { name: 'Split' }).click()
}

test('a receipt in euros is converted at the rate for its day', async ({ page }) => {
  await stubRate(page)
  await startTrip(page)

  await page.getByRole('button', { name: 'Add an expense' }).click()
  await page.getByLabel('Date').fill('2026-08-14')
  await page.getByLabel('Paid in').selectOption('EUR')
  await page.getByLabel('Amount in EUR').fill('62.40')

  // 62,40 € at 24,21 is 1 510,70 Kč.
  await expect(page.getByText('= 1 510,70 Kč')).toBeVisible()
  await expect(page.getByText('ECB, 14. 8.')).toBeVisible()
})

test('the converted amount is what the split actually divides', async ({ page }) => {
  await stubRate(page)
  await startTrip(page)

  await page.getByText('Price from the receipts').click()
  await page.getByRole('button', { name: 'Add an expense' }).click()
  await page.getByLabel('Paid in').selectOption('EUR')
  await page.getByLabel('Amount in EUR').fill('62.40')

  // The whole 1 510,70 Kč gets divided, so each of the two owes 755 Kč.
  await expect(readoutOf(page)).toContainText('1 511 Kč')
  await expect(page.getByText('Janca: 755 Kč')).toBeVisible()
})

test('typing your own rate drops the feed’s attribution', async ({ page }) => {
  await stubRate(page)
  await startTrip(page)

  await page.getByRole('button', { name: 'Add an expense' }).click()
  await page.getByLabel('Paid in').selectOption('EUR')
  await page.getByLabel('Amount in EUR').fill('100')
  await expect(page.getByText('ECB, 14. 8.')).toBeVisible()

  // The trip shows its currency as a symbol, so the field is labelled with one.
  await page.getByLabel('Kč per EUR').fill('25')
  await expect(page.getByText('= 2 500,00 Kč')).toBeVisible()
  await expect(page.getByText('ECB, 14. 8.')).toHaveCount(0)
})

test('an amount with no rate is called out rather than counted as nothing', async ({ page }) => {
  await stubNoRate(page)
  await startTrip(page)

  await page.getByRole('button', { name: 'Add an expense' }).click()
  await page.getByLabel('Paid in').selectOption('EUR')
  await page.getByLabel('Amount in EUR').fill('62.40')

  await expect(page.getByText('no rate — not being counted')).toBeVisible()
  await expect(page.getByText('is in EUR with no exchange rate')).toBeVisible()
})

test('tolls can be foreign too, and land in the split', async ({ page }) => {
  await stubRate(page)
  await startTrip(page)

  const overhead = await addExpense(page, 'Motorway toll', '0', 'Extra')
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
  await page.getByText('Price from the receipts').click()
  await page.getByRole('button', { name: 'Add an expense' }).click()
  await page.getByLabel('Paid in').selectOption('EUR')
  await page.getByLabel('Amount in EUR').fill('62.40')
  await expect(page.getByText('= 1 510,70 Kč')).toBeVisible()

  await page.getByLabel('Paid in').selectOption('CZK')
  // No longer a conversion: the figure that was reached stays as the amount.
  await expect(page.getByLabel('Paid in')).toHaveValue('CZK')
  await expect(page.getByText('= 1 510,70 Kč')).toHaveCount(0)
  await expect(readoutOf(page)).toContainText('1 511 Kč')
})
