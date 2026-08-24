import { describe, expect, it } from 'vitest'
import { LITERS_PER_US_GALLON, selectFuelPrice } from './fuelPrices'

/** Shaped exactly like the live openvan.camp response. */
const feed = {
  success: true,
  data: {
    CZ: {
      country_code: 'CZ',
      country_name: 'Czech Republic',
      currency: 'CZK',
      unit: 'liter',
      prices: { gasoline: 40.954, diesel: 44.4139, lpg: 21.7577, cng: 41, e85: null },
      fetched_at: '2026-08-22T08:50:59+03:00',
      is_excluded: false,
    },
    US: {
      country_code: 'US',
      country_name: 'United States',
      currency: 'USD',
      unit: 'gallon',
      prices: { gasoline: 4.0763, diesel: 5.4466, lpg: 3.42 },
      fetched_at: '2026-08-22T08:50:59+03:00',
    },
    XX: {
      country_name: 'Nowhere',
      currency: 'XXX',
      unit: 'liter',
      prices: { gasoline: 1 },
      is_excluded: true,
    },
    NP: { country_name: 'No Price', currency: 'EUR', unit: 'liter', prices: { gasoline: null, diesel: 0 } },
    NC: { country_name: 'No Currency', unit: 'liter', prices: { gasoline: 1.5 } },
  },
  meta: { total_countries: 142 },
}

describe('selectFuelPrice', () => {
  it('reads a per-litre price straight off the feed', () => {
    expect(selectFuelPrice(feed, 'CZ', 'gasoline')).toEqual({
      country: 'CZ',
      countryName: 'Czech Republic',
      currency: 'CZK',
      energyKind: 'gasoline',
      pricePerUnit: 40.95,
      convertedFromGallons: false,
      fetchedAt: '2026-08-22T08:50:59+03:00',
    })
  })

  it('picks the price for the energy kind asked for', () => {
    expect(selectFuelPrice(feed, 'CZ', 'diesel')?.pricePerUnit).toBe(44.41)
    expect(selectFuelPrice(feed, 'CZ', 'lpg')?.pricePerUnit).toBe(21.76)
  })

  it('converts the countries that quote gallons', () => {
    const price = selectFuelPrice(feed, 'US', 'gasoline')
    expect(price?.convertedFromGallons).toBe(true)
    // Without this the US price would come out 3.8x too low.
    expect(price?.pricePerUnit).toBe(Math.round((4.0763 / LITERS_PER_US_GALLON) * 100) / 100)
    expect(price?.pricePerUnit).toBeCloseTo(1.08, 2)
  })

  it('never offers a price for electricity', () => {
    expect(selectFuelPrice(feed, 'CZ', 'electric')).toBeNull()
  })

  it('accepts a lower-case country code', () => {
    expect(selectFuelPrice(feed, 'cz', 'gasoline')?.country).toBe('CZ')
  })

  it('returns null for a country the feed does not carry', () => {
    expect(selectFuelPrice(feed, 'ZW', 'gasoline')).toBeNull()
  })

  it('respects the feed excluding an entry it does not stand behind', () => {
    expect(selectFuelPrice(feed, 'XX', 'gasoline')).toBeNull()
  })

  it('returns null rather than zero when the price is missing', () => {
    expect(selectFuelPrice(feed, 'NP', 'gasoline')).toBeNull()
    expect(selectFuelPrice(feed, 'NP', 'diesel')).toBeNull()
  })

  it('returns null without a currency, since a bare number would be meaningless', () => {
    expect(selectFuelPrice(feed, 'NC', 'gasoline')).toBeNull()
  })

  it('rejects anything that is not a two-letter code', () => {
    for (const bad of ['', '  ', 'CZE', '1', 'C']) {
      expect(selectFuelPrice(feed, bad, 'gasoline')).toBeNull()
    }
  })

  it('survives junk where the feed should be', () => {
    for (const junk of [null, undefined, 'nope', 42, [], {}, { data: null }, { data: [] }]) {
      expect(selectFuelPrice(junk, 'CZ', 'gasoline')).toBeNull()
    }
  })
})
