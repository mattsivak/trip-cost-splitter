/**
 * Revolut payment links.
 *
 *   https://revolut.me/<handle>?currency=CZK&amount=12100&note=Janca%20-%20Trip
 *
 * The amount is in minor units, so 12100 is 121,00 CZK — the same unit the
 * rest of this app counts money in.
 *
 * Revolut does not document this: their public docs cover Business payment
 * links, a different product behind an API, and revolut.me serves the same
 * page for every path so it cannot be probed. It is therefore isolated here,
 * behind one function with tests, so a correction has exactly one place to go.
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

/** Long enough to say which trip; short enough not to bloat the link. */
const MAX_NOTE = 100

/**
 * A link that opens Revolut with the amount, currency and a note already
 * filled in.
 *
 * `amountMinor` is minor units, matching the rest of the domain. Returns null
 * rather than a half-built URL when anything is missing: a payment link that
 * quietly asks for the wrong amount is worse than no link at all.
 */
export function buildRevolutLink(
  handle: string,
  amountMinor: number,
  currencyCode: string,
  note = '',
): string | null {
  const name = normalizeRevolutHandle(handle)
  if (!name) return null

  const code = currencyCode.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(code)) return null

  if (!Number.isInteger(amountMinor) || amountMinor <= 0) return null

  const query = [`currency=${code}`, `amount=${amountMinor}`]

  const trimmed = note.trim().slice(0, MAX_NOTE).trim()
  // encodeURIComponent, not URLSearchParams: the latter writes spaces as '+'.
  if (trimmed) query.push(`note=${encodeURIComponent(trimmed)}`)

  return `${HOST}/${name}?${query.join('&')}`
}

/** The note people see on the request: who it is for, and which trip. */
export function paymentNote(personName: string, tripTitle: string): string {
  const person = personName.trim()
  const title = tripTitle.trim()
  if (person && title) return `${person} - ${title}`
  return person || title
}
