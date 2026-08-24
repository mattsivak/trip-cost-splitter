import { fromMajor, type Money } from '~/src/domain/money/money'
import type { EnergyKind } from '~/src/domain/pricing/energyKind'
import type { LocalFuelPrice } from '~/src/domain/pricing/fuelPrices'

export interface LocalPriceAnswer {
  price: LocalFuelPrice | null
  country: string | null
  reason: 'no-national-price' | 'unknown-country' | 'no-price-for-country' | null
}

/**
 * The local pump price for a given energy kind.
 *
 * Always resolves. A slow or broken lookup returns nothing rather than
 * throwing, because every caller's fallback is simply an empty price field.
 */
export async function fetchLocalPrice(energyKind: EnergyKind): Promise<LocalPriceAnswer> {
  // Typed as a plain string so Nitro does not try to infer the route's shape;
  // the inference recurses too deeply on a route with a query.
  const url: string = '/api/pricing/local'

  try {
    return await $fetch<LocalPriceAnswer>(url, {
      query: { kind: energyKind },
      // Nothing here is worth making somebody wait for.
      signal: AbortSignal.timeout(6000),
    })
  } catch {
    return { price: null, country: null, reason: 'unknown-country' }
  }
}

/** The looked-up price as minor units, ready for a Trip. */
export function priceToMoney(price: LocalFuelPrice): Money {
  return fromMajor(price.pricePerUnit)
}
