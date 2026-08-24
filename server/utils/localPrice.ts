import { countryFromGeoJs, geoLookupFor } from '../../src/domain/geo/clientCountry'
import { selectFuelPrice, type LocalFuelPrice } from '../../src/domain/pricing/fuelPrices'
import type { CountrySource } from '../../src/domain/geo/clientCountry'
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

/** Key for the server's own country, which has no client IP to file it under. */
const OWN_IP = '@self'

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

export interface CountryLookup {
  country: string | null
  via: CountrySource | null
}

/**
 * Which country a request came from.
 *
 * A public client address is looked up directly. A loopback or LAN address
 * never resolves, so rather than ask about it — which would leak a pointless
 * request — we ask which country *this server* is in. That is the same answer
 * in the case it matters for: running the app locally, where the visitor and
 * the server are the same machine.
 *
 * In a real deployment a CDN header answers first and this is never reached.
 */
export async function countryForRequest(ip: string | null): Promise<CountryLookup> {
  const { url, via } = geoLookupFor(ip, GEO_URL)
  const key = via === 'client-ip' ? (ip as string) : OWN_IP

  const cached = countries.get(key)
  if (fresh(cached, COUNTRY_TTL_MS)) return { country: cached.value, via: cached.value ? via : null }

  try {
    const country = countryFromGeoJs(await getJson(url))
    countries.set(key, { at: Date.now(), value: country })
    return { country, via: country ? via : null }
  } catch {
    // A geolocation outage must not stop anyone creating a trip.
    countries.set(key, { at: Date.now(), value: null })
    return { country: null, via: null }
  }
}

export async function priceForCountry(
  country: string,
  energyKind: EnergyKind,
): Promise<LocalFuelPrice | null> {
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
