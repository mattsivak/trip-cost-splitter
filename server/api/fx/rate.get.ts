import { isCurrencyCode, normalizeCurrencyCode } from '../../../src/domain/pricing/fxRates'
import { rateFor } from '../../utils/fxRates'

/**
 * An exchange rate, for prefilling a receipt paid in another currency.
 *
 * The browser never talks to the rate feed directly — same reason the routing
 * endpoints exist. It keeps one cache in front of a service that asks not to
 * be polled hard, and keeps the choice of provider a server-side detail.
 *
 * Every failure answers 200 with `rate: null`. Entering a receipt must never
 * depend on a third party being up; the field simply waits to be filled in.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const from = query.from
  const to = query.to
  const on = typeof query.on === 'string' ? query.on : undefined

  if (!isCurrencyCode(from) || !isCurrencyCode(to)) {
    return { rate: null, reason: 'bad-currency' as const }
  }

  if (normalizeCurrencyCode(from) === normalizeCurrencyCode(to)) {
    return { rate: null, reason: 'same-currency' as const }
  }

  const rate = await rateFor(from, to, on)
  return rate ? { rate, reason: null } : { rate: null, reason: 'no-rate' as const }
})
