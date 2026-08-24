/**
 * Working out which country a request came from, without asking the browser.
 *
 * The browser's geolocation API would put a permission prompt in front of
 * somebody who only wants a fuel price prefilled, so this uses the request
 * instead. A CDN that already knows the country is preferred; an IP lookup is
 * the fallback, and it only happens when there is a public address to look up.
 */

export type Headers = Record<string, string | string[] | undefined>

/** Country headers set by the usual proxies, in the order we trust them. */
const COUNTRY_HEADERS = ['cf-ipcountry', 'x-vercel-ip-country', 'x-country-code', 'x-geo-country']

/** Placeholders these proxies use when they do not actually know. */
const UNKNOWN_COUNTRIES = new Set(['XX', 'T1', 'A1', 'A2', 'ZZ', 'O1'])

export function countryFromHeaders(headers: Headers): string | null {
  for (const name of COUNTRY_HEADERS) {
    const value = first(headers[name]).trim().toUpperCase()
    if (/^[A-Z]{2}$/.test(value) && !UNKNOWN_COUNTRIES.has(value)) return value
  }
  return null
}

export function clientIpFromHeaders(headers: Headers, remoteAddress?: string): string | null {
  // The left-most entry of x-forwarded-for is the original client.
  const forwarded = first(headers['x-forwarded-for']).split(',')[0]?.trim()
  const candidates = [
    forwarded,
    first(headers['cf-connecting-ip']).trim(),
    first(headers['x-real-ip']).trim(),
    remoteAddress?.trim(),
  ]

  for (const candidate of candidates) {
    const ip = normalizeIp(candidate ?? '')
    if (ip) return ip
  }
  return null
}

/**
 * Whether an address is worth sending to a geolocation service. Loopback and
 * LAN addresses never resolve, so asking about them leaks a request for
 * nothing.
 */
export function isPublicIp(ip: string): boolean {
  const value = normalizeIp(ip)
  if (!value) return false
  if (value === '::1' || value.toLowerCase() === 'localhost') return false

  if (value.includes(':')) {
    const lower = value.toLowerCase()
    // Unique-local (fc00::/7) and link-local (fe80::/10).
    return !(
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe8') ||
      lower.startsWith('fe9') ||
      lower.startsWith('fea') ||
      lower.startsWith('feb')
    )
  }

  const octets = value.split('.').map(Number)
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255))
    return false

  const [a = 0, b = 0] = octets
  if (a === 10 || a === 127 || a === 0) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 169 && b === 254) return false
  if (a === 100 && b >= 64 && b <= 127) return false // carrier-grade NAT
  return true
}

/** Read a country out of a GeoJS `/v1/ip/country/{ip}.json` response. */
export function countryFromGeoJs(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null

  const value = (payload as { country?: unknown }).country
  const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return /^[A-Z]{2}$/.test(code) && !UNKNOWN_COUNTRIES.has(code) ? code : null
}

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

function normalizeIp(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  // Proxies sometimes hand back IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(trimmed)
  return mapped?.[1] ?? trimmed
}

export type CountrySource = 'client-ip' | 'server-ip'

/**
 * Which address to geolocate, and what that answer will mean.
 *
 * A public client address is looked up directly. For a loopback or LAN
 * address there is nothing useful to look up, so we ask GeoJS about *our own*
 * outbound address instead — which it reports when given no address at all.
 *
 * That is not a fudge: the case it covers is running the app locally, where
 * the visitor and the server are the same machine, and the server's country is
 * exactly the right answer. Skipping the lookup entirely, as an earlier
 * version did, meant the price was never prefilled in development.
 *
 * A real deployment answers from a CDN header long before reaching this.
 */
export function geoLookupFor(ip: string | null, base: string): { url: string; via: CountrySource } {
  return ip && isPublicIp(ip)
    ? { url: `${base}/${encodeURIComponent(ip)}.json`, via: 'client-ip' }
    : { url: `${base}.json`, via: 'server-ip' }
}
