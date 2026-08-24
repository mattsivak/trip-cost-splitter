import { currencyCodeFor } from '../money/currency'
import type { Trip } from '../trip/types'
import { buildRevolutLink, normalizeRevolutHandle } from './revolut'

type PayableTrip = Pick<Trip, 'currency' | 'currencyCode' | 'revolutHandle'>

/**
 * The ISO code to build a payment link with.
 *
 * A trip carries `currency` as free text for display and `currencyCode` when
 * something knew it for certain. Falling back to a guess from the symbol is
 * what makes a link appear at all on a trip that never went near the price
 * lookup; returning null keeps us from inventing one.
 */
export function paymentCurrencyCode(trip: PayableTrip): string | null {
  return trip.currencyCode?.trim().toUpperCase() || currencyCodeFor(trip.currency)
}

/**
 * Whether payment links can be built at all.
 *
 * Anything claiming a payment button exists must ask this, or the interface
 * ends up promising a button it cannot render.
 */
export function canBuildPaymentLinks(trip: PayableTrip): boolean {
  return Boolean(trip.revolutHandle && normalizeRevolutHandle(trip.revolutHandle) && paymentCurrencyCode(trip))
}

export function paymentLinkFor(trip: PayableTrip, amountMajor: number): string | null {
  const code = paymentCurrencyCode(trip)
  if (!trip.revolutHandle || !code) return null
  return buildRevolutLink(trip.revolutHandle, amountMajor, code)
}
