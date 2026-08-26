import type { FxRate } from '~/src/domain/pricing/fxRates'

export interface FxRateAnswer {
  rate: FxRate | null
  reason: 'bad-currency' | 'same-currency' | 'no-rate' | null
}

/**
 * The exchange rate for one day, for prefilling a foreign amount.
 *
 * Always resolves. A slow or broken lookup returns nothing rather than
 * throwing, because the fallback everywhere is a rate the user types in.
 */
export async function fetchFxRate(from: string, to: string, on?: string): Promise<FxRateAnswer> {
  // Typed as a plain string so Nitro does not try to infer the route's shape;
  // the inference recurses too deeply on a route with a query.
  const url: string = '/api/fx/rate'

  try {
    return await $fetch<FxRateAnswer>(url, {
      query: on ? { from, to, on } : { from, to },
      // Nothing here is worth making somebody wait for.
      signal: AbortSignal.timeout(6000),
    })
  } catch {
    return { rate: null, reason: 'no-rate' }
  }
}
