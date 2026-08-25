import { formatMoney, fromMajor, toMajor, type Money } from '~/src/domain/money/money'
import { formatEnergy } from '~/src/domain/pricing/energyKind'
import type { Trip } from '~/src/domain/trip/types'

/** Formatting helpers bound to one trip's currency. */
export function useMoney(currency: MaybeRefOrGetter<string>) {
  return {
    /** Whole units, the way the amount is actually settled. */
    money: (amount: Money) => formatMoney(amount, toValue(currency)),
    /** The exact amount, for the detail columns. */
    exact: (amount: Money) => formatMoney(amount, toValue(currency), 2),
    toMajor,
    fromMajor,
  }
}

export function formatKm(km: number): string {
  return `${(Math.round(km * 10) / 10).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} km`
}

/**
 * How much of the trip something accounted for.
 *
 * Litres of fuel normally. Kilometres when the trip is priced by the
 * kilometre, where no fuel was ever counted and a litre figure would be
 * reporting a measurement nobody took.
 */
export function formatBasis(
  trip: Pick<Trip, 'pricing' | 'energyKind'>,
  energy: number,
  distanceKm: number,
): string {
  return trip.pricing.mode === 'per-km' ? formatKm(distanceKm) : formatEnergy(energy, trip.energyKind)
}
