/**
 * Revolut payment links.
 *
 * The format below — revolut.me/<handle>/<amount><currency> — is the one in
 * common use, but Revolut does not document it: their public docs cover
 * Business payment links, which are a different product behind an API, and
 * revolut.me serves the same page for every path so it cannot be probed.
 *
 * It is therefore isolated here, behind one function with tests, so that if it
 * turns out to be wrong there is exactly one place to fix. The interface
 * offers a way to test a link before anyone sends it to eight people.
 */

const HOST = 'https://revolut.me'

/** Revolut handles are alphanumerics, dots, dashes and underscores. */
const HANDLE = /^[a-zA-Z0-9._-]{2,32}$/

/**
 * Pull a handle out of whatever the user pasted: a bare name, an @name, a
 * revolut.me URL, or one with the amount already on it.
 */
export function normalizeRevolutHandle(input: string): string | null {
  let value = input.trim()
  if (!value) return null

  value = value.replace(/^https?:\/\//i, '').replace(/^www\./i, '')
  if (value.toLowerCase().startsWith('revolut.me/')) value = value.slice('revolut.me/'.length)

  // Drop anything after the handle, such as an amount already in the path.
  value = value.split(/[/?#]/)[0] ?? ''
  value = value.replace(/^@/, '').trim()

  return HANDLE.test(value) ? value : null
}

export function revolutProfileUrl(handle: string): string | null {
  const name = normalizeRevolutHandle(handle)
  return name ? `${HOST}/${name}` : null
}

/**
 * A link that opens Revolut with the amount already filled in.
 *
 * Returns null rather than a half-built URL when anything is missing: a
 * payment link that quietly asks for the wrong amount is worse than no link.
 */
export function buildRevolutLink(handle: string, amountMajor: number, currencyCode: string): string | null {
  const name = normalizeRevolutHandle(handle)
  if (!name) return null

  const code = currencyCode.trim().toLowerCase()
  if (!/^[a-z]{3}$/.test(code)) return null

  if (!Number.isFinite(amountMajor) || amountMajor <= 0) return null

  return `${HOST}/${name}/${formatAmount(amountMajor)}${code}`
}

/** Whole units where possible, two decimals otherwise, never a trailing dot. */
function formatAmount(amountMajor: number): string {
  const rounded = Math.round(amountMajor * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
}
