import { expect, test, type Page } from '@playwright/test'
import { addDrive, addPeople, addPurchase, everyoneAboard, goTo, openDemo, paidBy } from './support/trip'

/**
 * The page your friends get.
 *
 * They did not build the trip and have no interest in the app. They opened a
 * link in a group chat, on a phone, and want to know what they owe, why, and
 * how to pay it. What they got was the owner's collections desk: the app's
 * masthead, the owner's save badge, and a list of eight names sorted by amount
 * with nothing marking which line was theirs.
 */

async function stubPrice(page: Page) {
  await page.route('**/api/pricing/local**', (route) =>
    route.fulfill({ json: { price: null, country: null, reason: 'unknown-country' } }),
  )
}

/** The example trip, published, with the handle set so there are pay buttons. */
async function publish(page: Page) {
  await openDemo(page)
  await goTo(page, 'Settle up')
  await page.getByLabel('Your Revolut handle').fill('mattsivak')
  await page.waitForResponse(
    (response) => response.url().includes('/api/trips/') && response.request().method() === 'PUT',
  )
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
}

async function copyLinkFor(page: Page, name: string): Promise<string> {
  await page.getByRole('button', { name: `Copy ${name}'s link` }).click()
  return await page.evaluate(() => navigator.clipboard.readText())
}

test('the driver can copy a link that knows who it is for', async ({ page }) => {
  await publish(page)
  const link = await copyLinkFor(page, 'Terka')

  expect(link).toMatch(/\/view\/[^#]+#[0-9a-f]+\.[\w-]+$/)
})

test('the page opens with the reader’s own name and amount', async ({ page }) => {
  await publish(page)
  const link = await copyLinkFor(page, 'Terka')

  await page.goto(link)
  await expect(page.getByRole('heading', { name: /Terka, you owe 804 Kč/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Pay 804 Kč/ })).toBeVisible()
})

test('the typed way to pay is on the page, not only the button', async ({ page }) => {
  await publish(page)
  await page.goto(await copyLinkFor(page, 'Terka'))

  // A Revolut link can land somewhere odd. The details to type by hand are
  // there whether or not the button works.
  const fallback = page.locator('.owed__fallback')
  await expect(fallback).toContainText('revolut.me/mattsivak')
  await expect(fallback).toContainText('804')
  await expect(fallback).toContainText('CZK')
})

test('everybody else is there, but folded away', async ({ page }) => {
  await publish(page)
  await page.goto(await copyLinkFor(page, 'Terka'))

  const others = page.locator('summary', { hasText: /everyone else/i })
  await expect(others).toBeVisible()
  // Folded, not absent: somebody else's amount is not the reader's business
  // until they go looking for it.
  await expect(page.getByText('Janča').first()).toBeHidden()

  await others.click()
  await expect(page.getByText('Janča').first()).toBeVisible()
})

test('the app’s own chrome stays off the page', async ({ page }) => {
  await publish(page)
  await page.goto(await copyLinkFor(page, 'Terka'))

  // The save badge belongs to whoever is editing; the reader is not editing.
  await expect(page.locator('.save-state')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Trip Cost Splitter' })).toHaveCount(0)
})

test('a link with no name asks which one you are, and remembers', async ({ page }) => {
  await publish(page)
  await page.getByRole('button', { name: 'Copy the payment link' }).click()
  const link = await page.evaluate(() => navigator.clipboard.readText())

  await page.goto(link)
  await expect(page.getByText('Which one are you?')).toBeVisible()
  await page.getByRole('button', { name: 'Terka', exact: true }).click()

  await expect(page.getByRole('heading', { name: /Terka, you owe/ })).toBeVisible()

  // And it does not ask again on this device.
  await page.reload()
  await expect(page.getByRole('heading', { name: /Terka, you owe/ })).toBeVisible()
})

test('somebody who is owed money is told that, not asked to pay', async ({ page }) => {
  await stubPrice(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a trip' }).click()
  await expect(page.getByRole('heading', { name: 'Who came along' })).toBeVisible()

  await addPeople(page, ['Matthew', 'Janca'])
  await addDrive(page, 'A', 'B', '100')
  await everyoneAboard(page)

  await goTo(page, 'Route')
  await page.locator('.pricing').getByText('From the receipts').click()
  await addPurchase(page, 'The tank', '600', true)
  await paidBy(page, 'The tank', 'Janca')

  await goTo(page, 'Settle up')
  await page.getByLabel('Your Revolut handle').fill('mattsivak')
  await page.waitForResponse(
    (response) => response.url().includes('/api/trips/') && response.request().method() === 'PUT',
  )
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(await copyLinkFor(page, 'Janca'))

  await expect(page.getByRole('heading', { name: /Janca, you are owed 300 Kč/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Pay/ })).toHaveCount(0)
})
