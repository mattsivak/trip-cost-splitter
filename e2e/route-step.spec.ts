import { expect, test, type Page } from '@playwright/test'

/**
 * These cover the parts of step 1 that only exist in a browser: real HTML5
 * drag-and-drop, and what a route lookup does to the list. The arithmetic
 * underneath is unit-tested; this is here to catch the wiring coming loose.
 */

/** The route lookup is stubbed so these tests never depend on OSRM being up. */
async function stubRouting(page: Page, stops: string[]) {
  await page.route('**/api/routing/geocode', async (route) => {
    const { query } = route.request().postDataJSON() as { query: string }
    await route.fulfill({
      json: { provider: 'osrm', results: [{ label: query, lat: 49.5, lon: 17.2 }] },
    })
  })

  await page.route('**/api/routing/route', async (route) => {
    const legs = stops.slice(0, -1).map((from, index) => ({
      fromLabel: from,
      toLabel: stops[index + 1],
      distanceKm: 50 + index,
    }))
    await route.fulfill({
      json: { provider: 'osrm', legs, totalDistanceKm: legs.length * 50 },
    })
  })
}

async function openDemo(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open the example trip' }).click()
  await expect(page.getByRole('heading', { name: 'Where the car went' })).toBeVisible()
}

const partNames = (page: Page) => page.locator('article.segment h3')

/**
 * Drag one part onto another, as a person would.
 *
 * Two things make this fiddlier than it looks. Playwright only turns on
 * Chromium's drag interception inside `dragTo`, and without it no dragover or
 * drop is ever delivered. But `dragTo` also jumps the cursor in one hop, so
 * Chromium begins the drag over the *target* — the source card never moves.
 *
 * So: a throwaway drag onto itself arms interception, then the moves below
 * start the drag at the handle and walk it to the target. Both cards must be
 * within the viewport, which is why this spec runs tall.
 */
async function dragPart(page: Page, from: number, to: number) {
  const parts = page.locator('article.segment')
  const handle = parts.nth(from).locator('.grip')

  await handle.dragTo(handle)

  const source = await handle.boundingBox()
  const target = await parts.nth(to).locator('.segment__head').boundingBox()
  if (!source || !target) throw new Error('a part is not on screen to drag')

  const [sx, sy] = [source.x + source.width / 2, source.y + source.height / 2]
  const [tx, ty] = [target.x + target.width / 2, target.y + target.height / 2]

  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx + 4, sy + 4) // begins the drag on the handle
  await page.mouse.move(tx, ty, { steps: 20 })
  await page.mouse.move(tx, ty + 1) // a second move, so dragover lands on the target
  await page.mouse.up()
}

test.beforeEach(async ({ context }) => {
  // Each test gets a clean browser, so the demo trip always starts unedited.
  await context.clearCookies()
})

test('the example trip lists its parts in the order they happened', async ({ page }) => {
  await openDemo(page)

  await expect(partNames(page)).toHaveText([
    'Šumperk → Olomouc',
    'Olomouc → Milovice',
    'Canister burned waiting at Milovice',
    'Milovice → Olomouc',
    'Olomouc → Vsetín',
    'Vsetín → Kunčice',
    'Kunčice → Olomouc',
    'Olomouc → Šumperk',
  ])
})

test('an idle stop is added after the drive it belongs to, not at the end', async ({ page }) => {
  await openDemo(page)

  await page
    .locator('article.segment')
    .first()
    .getByRole('button', { name: 'Add an idle stop after this' })
    .click()

  await expect(partNames(page).nth(1)).toHaveText('Waiting at Olomouc')
  await expect(partNames(page).last()).toHaveText('Olomouc → Šumperk')
})

test.describe('dragging', () => {
  // Tall enough that several parts share the viewport; a native drag cannot
  // reach a drop target that is below the fold.
  test.use({ viewport: { width: 1400, height: 1800 } })

  test('a part can be dragged to a new position by its handle', async ({ page }) => {
    await openDemo(page)

    await dragPart(page, 0, 3)

    await expect(partNames(page)).toHaveText([
      'Olomouc → Milovice',
      'Canister burned waiting at Milovice',
      'Milovice → Olomouc',
      'Šumperk → Olomouc',
      'Olomouc → Vsetín',
      'Vsetín → Kunčice',
      'Kunčice → Olomouc',
      'Olomouc → Šumperk',
    ])
  })

  test('dragging a part backwards works too', async ({ page }) => {
    await openDemo(page)

    await dragPart(page, 3, 0)

    await expect(partNames(page).first()).toHaveText('Milovice → Olomouc')
    await expect(partNames(page).nth(1)).toHaveText('Šumperk → Olomouc')
  })

  test('dropping a part on itself changes nothing', async ({ page }) => {
    await openDemo(page)

    await dragPart(page, 1, 1)

    await expect(partNames(page).nth(1)).toHaveText('Olomouc → Milovice')
  })
})

test('the text inputs still work despite the cards being drop targets', async ({ page }) => {
  await openDemo(page)

  const distance = page.locator('article.segment').first().getByLabel('Distance km')
  await distance.fill('123.4')
  await expect(distance).toHaveValue('123.4')
})

test('a route lookup keeps idle stops where they happened', async ({ page }) => {
  await stubRouting(page, ['Šumperk', 'Olomouc', 'Milovice', 'Vsetín', 'Kunčice'])
  await openDemo(page)

  await page.getByRole('button', { name: 'Look up the route' }).click()
  await expect(page.getByText('Found 4 drives via OpenStreetMap')).toBeVisible()

  // The canister was burned at Milovice, so it stays behind the drive that
  // arrives there — even though the route is now shorter and reshaped.
  await expect(partNames(page)).toHaveText([
    'Šumperk → Olomouc',
    'Olomouc → Milovice',
    'Canister burned waiting at Milovice',
    'Milovice → Vsetín',
    'Vsetín → Kunčice',
  ])
})

test('a route lookup keeps an idle stop anchored when a stop is inserted before it', async ({ page }) => {
  await stubRouting(page, ['Šumperk', 'Zábřeh', 'Olomouc', 'Milovice'])
  await openDemo(page)

  await page.getByRole('button', { name: 'Look up the route' }).click()
  await expect(page.getByText('Found 3 drives via OpenStreetMap')).toBeVisible()

  // Milovice is now reached one drive later; the canister moves with it.
  await expect(partNames(page)).toHaveText([
    'Šumperk → Zábřeh',
    'Zábřeh → Olomouc',
    'Olomouc → Milovice',
    'Canister burned waiting at Milovice',
  ])
})

test('the split still reconciles after the route is reshaped', async ({ page }) => {
  await stubRouting(page, ['Šumperk', 'Olomouc', 'Milovice'])
  await openDemo(page)

  await page.getByRole('button', { name: 'Look up the route' }).click()
  await expect(page.getByText('Found 2 drives via OpenStreetMap')).toBeVisible()

  await page.getByRole('button', { name: 'Split' }).click()

  const total = page.locator('tfoot td').last()
  await expect(total).toBeVisible()
  await expect(page.locator('.readout__cell').first().locator('.readout__value')).not.toHaveText('')
})
