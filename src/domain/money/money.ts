/**
 * Money is stored as an integer number of minor units (1/100 of a major unit).
 *
 * Every arithmetic operation in the domain happens on these integers. Floats
 * only appear at the edges: parsing user input and formatting for display.
 * This is what makes "collected equals spent" a structural property rather
 * than something we hope holds after rounding.
 */
export type Money = number

export const MINOR_UNITS = 100

/** Convert a major-unit amount (e.g. 43.5 Kč) to minor units. */
export function fromMajor(value: number): Money {
  if (!Number.isFinite(value)) return 0
  // `1.005 * 100` is 100.49999999999999 in binary floating point, which would
  // round down and lose a haléř. Collapsing the scaled value to a fixed number
  // of decimals first restores the amount the user actually typed.
  return Math.round(Number((value * MINOR_UNITS).toFixed(4)))
}

/** Convert minor units back to a major-unit number, for display only. */
export function toMajor(amount: Money): number {
  return amount / MINOR_UNITS
}

export function sumMoney(amounts: readonly Money[]): Money {
  return amounts.reduce((total, amount) => total + amount, 0)
}

/**
 * Round to a whole major unit. People pay whole crowns, not hundredths.
 */
export function roundToMajor(amount: Money, mode: RoundingMode = 'nearest'): Money {
  const major = amount / MINOR_UNITS
  const whole = mode === 'up' ? Math.ceil(major) : mode === 'down' ? Math.floor(major) : Math.round(major)
  return whole * MINOR_UNITS
}

export type RoundingMode = 'nearest' | 'up' | 'down'

/**
 * Split `total` across `weights` so that the parts sum to exactly `total`.
 *
 * Uses the largest-remainder method: floor every exact share, then hand the
 * leftover minor units to the entries with the largest discarded fractions.
 * Ties break toward the lower index, which keeps the result deterministic.
 *
 * If every weight is zero the total is spread evenly instead — a caller
 * splitting a real cost across real people should never silently drop it.
 */
export function allocate(total: Money, weights: readonly number[]): Money[] {
  if (weights.length === 0) return []

  const safeWeights = weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 0))
  const totalWeight = safeWeights.reduce((sum, weight) => sum + weight, 0)
  const effective = totalWeight > 0 ? safeWeights : safeWeights.map(() => 1)
  const effectiveTotal = totalWeight > 0 ? totalWeight : safeWeights.length

  const sign = total < 0 ? -1 : 1
  const magnitude = Math.abs(total)

  const exact = effective.map((weight) => (magnitude * weight) / effectiveTotal)
  const floors = exact.map((value) => Math.floor(value))
  let remainder = magnitude - floors.reduce((sum, value) => sum + value, 0)

  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)

  const result = [...floors]
  for (const { index } of order) {
    if (remainder <= 0) break
    result[index] = (result[index] ?? 0) + 1
    remainder -= 1
  }

  return result.map((value) => value * sign)
}

/**
 * Format for display. Defaults to whole units, which is how these amounts are
 * actually settled; pass `decimals` to show the exact underlying value.
 */
export function formatMoney(amount: Money, currency: string, decimals = 0): string {
  const value = toMajor(amount).toLocaleString('cs-CZ', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return `${value} ${currency}`
}
