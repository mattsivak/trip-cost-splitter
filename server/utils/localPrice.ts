import { countryFromGeoJs, isPublicIp } from '../../src/domain/geo/clientCountry'
import { selectFuelPrice, type LocalFuelPrice } from '../../src/domain/pricing/fuelPrices'
import type { EnergyKind } from '../../src/domain/pricing/energyKind'

const PRICES_URL = 'https://openvan.camp/api/fuel/prices'
const GEO_URL = 'https://get.geojs.io/v1/ip/country'

/** The feed's own cache is six hours, and it asks not to be polled hard. */
const PRICE_TTL_MS = 6 * 60 * 60 * 1000
const COUNTRY_TTL_MS = 24 * 60 * 60 * 1000
const TIMEOUT_MS = 4000

interface Cached<T> {
  at: number
  value: T
}

let prices: Cached<unknown> | null = null
const countries = new Map<string, Cached<string | null>>()

function fresh<T>(entry: Cached<T> | null | undefined, ttl: number): entry is Cached<T> {
  return !!entry && Date.now() - entry.at < ttl
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return response.json()
}

/**
 * Which country an IP is in.
 *
 * Only public addresses are looked up: a loopback or LAN address never
 * resolves, so asking about one sends somebody's request off-site for nothing.
 */
export async function countryForIp(ip: string | null): Promise<string | null> {
  if (!ip || !isPublicIp(ip)) return null

  const cached = countries.get(ip)
  if (fresh(cached, COUNTRY_TTL_MS)) return cached.value

  try {
    const country = countryFromGeoJs(await getJson(`${GEO_URL}/${encodeURIComponent(ip)}.json`))
    countries.set(ip, { at: Date.now(), value: country })
    return country
  } catch {
    // A geolocation outage must not stop anyone creating a trip.
    countries.set(ip, { at: Date.now(), value: null })
    return null
  }
}

export async function priceForCountry(country: string, energyKind: EnergyKind): Promise<LocalFuelPrice | null> {
  if (!fresh(prices, PRICE_TTL_MS)) {
    try {
      prices = { at: Date.now(), value: await getJson(PRICES_URL) }
    } catch {
      // Keep serving the stale copy if we have one; it beats no price at all.
      if (!prices) return null
    }
  }

  return selectFuelPrice(prices.value, country, energyKind)
}
