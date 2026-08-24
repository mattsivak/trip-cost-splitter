import { formatMoney, fromMajor, toMajor, type Money } from '~/src/domain/money/money'

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
