/*
 * Renders the PNG launcher icons from the two SVG sources.
 *
 * The PNGs are committed, so this only needs running when the mark changes:
 *   node scripts/build-icons.mjs
 *
 * Android needs real PNGs in the manifest (an SVG icon is not enough to make
 * the install prompt appear), and iOS only ever reads apple-touch-icon.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const ICONS = [
  { source: 'icon.svg', out: 'icon-192.png', size: 192 },
  { source: 'icon.svg', out: 'icon-512.png', size: 512 },
  { source: 'icon.svg', out: 'apple-touch-icon.png', size: 180 },
  { source: 'icon-maskable.svg', out: 'icon-maskable-512.png', size: 512 },
]

const dir = new URL('../public/icons/', import.meta.url)
const browser = await chromium.launch()

for (const { source, out, size } of ICONS) {
  const svg = await readFile(new URL(source, dir), 'utf8')
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(
    `<body style="margin:0">${svg.replace('<svg', `<svg width="${size}" height="${size}"`)}</body>`,
  )
  await writeFile(new URL(out, dir), await page.screenshot({ omitBackground: true }))
  await page.close()
  console.log(`${out} (${size}px)`)
}

await browser.close()
