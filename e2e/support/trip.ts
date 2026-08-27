import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Driving the app the way a person does: four steps, a ledger of lines, and
 * the people question asked once, on its own step.
 *
 * Every spec goes through here, so a change to the flow is one edit rather
 * than twelve.
 */

export type Step = 'People' | 'Route' | 'Who pays' | 'Settle up'

/** No spec should fail because a price feed was slow or moved. */
export async function stubPrice(page: Page, price: number | null = null) {
  await page.route('**/api/pricing/local**', (route) =>
    route.fulfill({
      json: price
        ? {
            price: {
              country: 'CZ',
              countryName: 'Czech Republic',
              currency: 'CZK',
              energyKind: 'gasoline',
              pricePerUnit: price,
              convertedFromGallons: false,
              fetchedAt: '2026-08-22T08:50:59+03:00',
            },
            country: 'CZ',
            reason: null,
          }
        : { price: null, country: null, reason: 'unknown-country' },
    }),
  )
}

export async function goTo(page: Page, step: Step) {
  await page.getByRole('navigation', { name: 'Steps' }).getByRole('button', { name: step }).click()
  await expect(
    page.getByRole('navigation', { name: 'Steps' }).getByRole('button', { name: step }),
  ).toHaveAttribute('aria-current', 'step')
}

export async function startTrip(page: Page) {
  await stubPrice(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a trip' }).click()
  await expect(page.getByRole('heading', { name: 'Who came along' })).toBeVisible()
}

export async function openDemo(page: Page) {
  await stubPrice(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Open the example trip' }).click()
  await expect(page.getByRole('heading', { name: 'Who came along' })).toBeVisible()
}

export async function addPeople(page: Page, names: string[]) {
  await goTo(page, 'People')
  for (const name of names) {
    await page.getByPlaceholder('Name', { exact: true }).fill(name)
    await page.getByRole('button', { name: 'Add person' }).click()
  }
}

/** One drive on the ledger. Distances are what the split is built from. */
export async function addDrive(page: Page, from: string, to: string, km: string) {
  await goTo(page, 'Route')
  await page.getByRole('button', { name: 'Add a drive' }).click()
  const line = page.locator('.ledger__line').last()
  await line.getByLabel('From').fill(from)
  await line.getByLabel('To').fill(to)
  await line.getByLabel('Distance km').fill(km)
  return line
}

/** One purchase. `fuel` makes it money that pays for the driving. */
export async function addPurchase(page: Page, label: string, amount: string, fuel = false) {
  await goTo(page, 'Route')
  await page.getByRole('button', { name: 'Add a purchase' }).click()
  const line = page.locator('.ledger__line').last()
  await line.getByLabel('What it was for').fill(label)
  await line.getByLabel('Amount').fill(amount)
  if (fuel) await line.locator('label.toggle', { hasText: 'pays for the driving' }).click()
  return line
}

/** A line on the who-pays step, by its name. */
export function lineOf(page: Page, label: string | RegExp): Locator {
  return page.getByRole('group', { name: label })
}

export async function everyoneAboard(page: Page) {
  await goTo(page, 'Who pays')
  // Wait for the step, or `all()` answers with the empty list of a page that
  // has not rendered yet and the clicks quietly do nothing.
  await expect(page.getByRole('heading', { name: 'Who pays for what' })).toBeVisible()
  for (const button of await page.getByRole('button', { name: 'Everyone', exact: true }).all()) {
    await button.click()
  }
}

export async function paidBy(page: Page, label: string | RegExp, name: string) {
  await goTo(page, 'Who pays')
  await lineOf(page, label).locator('.who__payers label.toggle').filter({ hasText: name }).click()
}

/** One person's line in the split. */
export function person(page: Page, name: string): Locator {
  return page.getByRole('group', { name: `${name}'s share` })
}

export async function workingOf(page: Page, name: string): Promise<Locator> {
  const line = person(page, name)
  await line.locator('summary').click()
  return line.locator('.person__working')
}

export function readout(page: Page): Locator {
  return page.getByRole('region', { name: 'Trip totals' })
}

/** Publish the trip and hand back the link the group would get. */
export async function paymentLink(page: Page, forPerson?: string): Promise<string> {
  await goTo(page, 'Settle up')
  await page.getByLabel('Your Revolut handle').fill('mattsivak')
  await page.waitForResponse(
    (response) => response.url().includes('/api/trips/') && response.request().method() === 'PUT',
  )
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page
    .getByRole('button', { name: forPerson ? `Copy ${forPerson}'s link` : 'Copy the payment link' })
    .click()
  return await page.evaluate(() => navigator.clipboard.readText())
}
