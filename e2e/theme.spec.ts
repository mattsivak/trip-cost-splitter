import { expect, test } from '@playwright/test'

const themeOf = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.getAttribute('data-theme'))

test('follows the system setting until told otherwise', async ({ page }) => {
  await page.goto('/')
  // No attribute means the media query decides, which is the point of Auto.
  expect(await themeOf(page)).toBeNull()
  await expect(page.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true')
})

test('an explicit choice overrides the system setting', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')

  await page.getByRole('button', { name: 'Dark' }).click()
  expect(await themeOf(page)).toBe('dark')

  await page.getByRole('button', { name: 'Light' }).click()
  expect(await themeOf(page)).toBe('light')
})

test('the choice survives a reload, and lands before the first paint', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Dark' }).click()

  await page.reload()
  // Read before anything else runs: the inline head script must already have
  // applied it, or the page would flash the wrong theme.
  expect(await themeOf(page)).toBe('dark')
  await expect(page.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true')
})

test('going back to Auto forgets the choice', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Dark' }).click()
  await page.getByRole('button', { name: 'Auto' }).click()

  expect(await themeOf(page)).toBeNull()
  await page.reload()
  expect(await themeOf(page)).toBeNull()
})

test('nothing on the page is left unreadable in dark mode', async ({ page }) => {
  await page.route('**/api/pricing/local**', (route) =>
    route.fulfill({ json: { price: null, country: null, reason: 'unknown-country' } }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Dark' }).click()
  await page.getByRole('button', { name: 'Open the example trip' }).click()
  await page.getByRole('heading', { name: 'Where the car went' }).waitFor()

  // Every painted background must come from the token set, not from a colour
  // that only made sense on paper.
  const offenders = await page.evaluate(() => {
    const bad: string[] = []
    for (const el of document.querySelectorAll('body *')) {
      const style = getComputedStyle(el)
      const bg = style.backgroundColor
      if (bg === 'rgb(255, 255, 255)' || bg === 'rgb(244, 241, 233)' || bg === 'rgb(234, 231, 223)') {
        bad.push(`${el.tagName}.${el.className} ${bg}`)
      }
    }
    return bad
  })
  expect(offenders).toEqual([])
})
