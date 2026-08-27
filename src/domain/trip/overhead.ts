import { allocate, sumMoney, type Money } from '../money/money'
import type { OverheadCost, Person, PersonId } from './types'

export interface OverheadAllocationResult {
  /** Per-person amounts in minor units. */
  shares: Record<PersonId, Money>
  /** What was actually handed out, which can differ from the stated amount. */
  total: Money
  warnings: string[]
}

/**
 * Spread one non-fuel cost across people.
 *
 * `total` is always the sum of `shares`, never the cost's nominal amount, so a
 * caller adding up allocations can never report money it did not distribute.
 */
export function allocateOverhead(cost: OverheadCost, people: readonly Person[]): OverheadAllocationResult {
  const warnings: string[] = []
  const known = new Set(people.map((person) => person.id))
  const shares: Record<PersonId, Money> = {}

  if (cost.allocation.type === 'fixed') {
    for (const [personId, amount] of Object.entries(cost.allocation.amounts)) {
      if (!known.has(personId)) {
        warnings.push(`"${cost.label}" assigns an amount to someone who is not on the trip.`)
        continue
      }
      shares[personId] = (shares[personId] ?? 0) + amount
    }

    const total = sumMoney(Object.values(shares))
    if (total !== cost.amount) {
      warnings.push(`"${cost.label}" is listed as one amount but its per-person amounts add up to another.`)
    }
    return { shares, total, warnings }
  }

  const requested = cost.allocation.personIds ?? people.map((person) => person.id)
  const targets = requested.filter((personId) => known.has(personId))

  if (targets.length === 0) {
    warnings.push(`"${cost.label}" has nobody to bill, so it is not charged to anyone.`)
    return { shares, total: 0, warnings }
  }

  const parts = allocate(
    cost.amount,
    targets.map(() => 1),
  )
  targets.forEach((personId, index) => {
    shares[personId] = (shares[personId] ?? 0) + (parts[index] ?? 0)
  })

  return { shares, total: cost.amount, warnings }
}

/**
 * Who a cost is charged to, written the way somebody would say it out loud.
 *
 * Both the editor and the read-only working need this sentence, and they must
 * not each have their own opinion about it. People no longer on the trip are
 * left out, exactly as `allocateOverhead` leaves them out of the money.
 */
export function describeAllocation(cost: OverheadCost, people: readonly Person[]): string {
  const known = new Map(people.map((person) => [person.id, person.name]))

  const targets =
    cost.allocation.type === 'fixed'
      ? Object.keys(cost.allocation.amounts)
      : (cost.allocation.personIds ?? null)

  if (targets === null) return 'everyone'

  const names = targets.flatMap((personId) => {
    const name = known.get(personId)
    return name ? [name] : []
  })

  if (!names.length) return 'nobody'
  if (names.length === 1) return names[0]!
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
