import { expect, test } from '@playwright/test'

test('the manifest says what a launcher needs to know', async ({ page, request }) => {
  await page.goto('/')

  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBe('/manifest.webmanifest')

  const manifest = await (await request.get(href!)).json()
  expect(manifest.name).toBe('Trip Cost Splitter')
  expect(manifest.start_url).toBe('/')
  expect(manifest.display).toBe('standalone')

  // Android will not offer to install without a 192 and a 512, and drops the
  // app on a circle-masking launcher without a maskable one.
  const png = manifest.icons.filter((icon: { type: string }) => icon.type === 'image/png')
  expect(png.map((icon: { sizes: string }) => icon.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  )
  expect(png.some((icon: { purpose: string }) => icon.purpose === 'maskable')).toBe(true)

  for (const icon of manifest.icons) {
    const response = await request.get(icon.src)
    expect(response.status(), `${icon.src} is missing`).toBe(200)
  }
})

test('iOS is given the icon and the name it reads instead of the manifest', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    '/icons/apple-touch-icon.png',
  )
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
    'content',
    'Trip Split',
  )
})

test.describe('on an iPhone', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 },
  })

  test('the masthead offers the only route iOS has', async ({ page }) => {
    await page.goto('/')

    const install = page.getByRole('button', { name: 'Install' })
    await expect(install).toBeVisible()
    await expect(page.getByText('Add to Home Screen')).toBeHidden()

    await install.click()
    await expect(page.getByText('Add to Home Screen')).toBeVisible()
  })
})

test('the service worker takes over the page', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)

  // Control arrives on the next navigation at the latest; asserting after a
  // reload is what proves the worker is actually serving this page.
  await page.reload()
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
})

test('a page already seen still opens with the network gone', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()

  await context.setOffline(true)
  await page.reload()

  await expect(page.getByRole('link', { name: /Trip Cost Splitter/ })).toBeVisible()
  await context.setOffline(false)
})

test('money is never served from the cache', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()

  // Warm whatever the API would have cached, then cut the network: the request
  // has to fail rather than answer with a figure that is no longer true.
  await page.evaluate(() => fetch('/api/pricing/local').catch(() => {}))
  await context.setOffline(true)

  const offlineResult = await page.evaluate(() =>
    fetch('/api/pricing/local')
      .then(() => 'answered')
      .catch(() => 'failed'),
  )
  expect(offlineResult).toBe('failed')
  await context.setOffline(false)
})
