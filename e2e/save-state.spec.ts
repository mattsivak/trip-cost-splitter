import { expect, test, type Page } from '@playwright/test'

/**
 * The save state in the masthead. Every edit is a request and this app is used
 * in cars and tunnels, so the interesting case is the one where the request
 * does not arrive.
 */
const badge = (page: Page) => page.getByRole('status')

/** Exact, or the "Trip totals" readout answers to the same name. */
const titleField = (page: Page) => page.getByRole('textbox', { name: 'Trip', exact: true })

/** Priced from a feed in real life; stubbed here so a spec cannot fail on a price. */
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

/** Cut the line under the save, and only the save: loading a trip still works. */
async function cutSaves(page: Page) {
  await page.route('**/api/trips/**', async (route) => {
    if (route.request().method() === 'PUT') await route.abort()
    else await route.fallback()
  })
}

async function startTrip(page: Page) {
  await stubLocalPrice(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a trip' }).click()
  await expect(page.getByRole('heading', { name: 'Where the car went' })).toBeVisible()
}

test('the trip list has nothing to save, and says nothing', async ({ page }) => {
  await page.goto('/')
  await expect(badge(page)).toHaveCount(0)
})

test('an edit is confirmed saved, and stays confirmed', async ({ page }) => {
  await startTrip(page)

  await titleField(page).fill('Brno and back')

  await expect(badge(page)).toContainText('Saved')
  // It does not fade: on a phone you look at it after the fact, not during.
  await page.waitForTimeout(2000)
  await expect(badge(page)).toContainText('Saved')
})

test('an edit that cannot reach the server says so, and Retry gets it there', async ({ page }) => {
  await startTrip(page)
  await cutSaves(page)

  await titleField(page).fill('Brno and back')
  await expect(badge(page)).toContainText('Not saved')

  await page.unroute('**/api/trips/**')
  await badge(page).getByRole('button', { name: 'Retry' }).click()

  await expect(badge(page)).toContainText('Saved')
  await expect(badge(page).getByRole('button', { name: 'Retry' })).toHaveCount(0)

  // And the edit really is on the server, not just claimed to be.
  await page.reload()
  await expect(titleField(page)).toHaveValue('Brno and back')
})

test('leaving the trip takes the badge with it', async ({ page }) => {
  await startTrip(page)

  await titleField(page).fill('Brno and back')
  await expect(badge(page)).toContainText('Saved')

  await page.getByRole('link', { name: 'Trip Cost Splitter' }).click()
  await expect(badge(page)).toHaveCount(0)
})
