import { clientIpFromHeaders, countryFromHeaders } from '../../../src/domain/geo/clientCountry'
import { isEnergyKind, canLookUpPrice } from '../../../src/domain/pricing/energyKind'
import { countryForIp, priceForCountry } from '../../utils/localPrice'

/**
 * The local pump price, for prefilling a new trip.
 *
 * Country comes from the request rather than the browser's geolocation API,
 * so nobody is asked for a permission they did not expect. A CDN that already
 * knows the country is used first; only without one does an address leave this
 * server, and nothing but the address goes with it.
 *
 * Every failure answers 200 with `price: null`. Creating a trip must never
 * depend on a third party being up.
 */
export default defineEventHandler(async (event) => {
  const kind = getQuery(event).kind
  const energyKind = isEnergyKind(kind) ? kind : 'gasoline'

  if (!canLookUpPrice(energyKind)) {
    return { price: null, country: null, reason: 'no-national-price' as const }
  }

  const headers = getRequestHeaders(event)
  const country =
    countryFromHeaders(headers) ??
    (await countryForIp(clientIpFromHeaders(headers, getRequestIP(event, { xForwardedFor: true }))))

  if (!country) return { price: null, country: null, reason: 'unknown-country' as const }

  const price = await priceForCountry(country, energyKind)
  return price
    ? { price, country, reason: null }
    : { price: null, country, reason: 'no-price-for-country' as const }
})
