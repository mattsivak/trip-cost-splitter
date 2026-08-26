import { allocate, roundToMajor, sumMoney, type Money } from '../money/money'
import { unitLabelFor } from '../pricing/energyKind'
import { costForSegment, distanceForSegment, energyForSegment, totalDistanceKm } from './energy'
import { allocateOverhead } from './overhead'
import type { PersonBreakdown, SegmentBreakdown, TripResult } from './result'
import type { PersonId, Trip } from './types'

/** One person's stake in one segment. The unit the whole split is built from. */
interface Claim {
  segmentIndex: number
  personId: PersonId
}

/** A pot of money and how it landed on each claim. */
interface Spread {
  claims: Claim[]
  /** Money for each claim, summing to exactly `pool` when there is anyone to bill. */
  amounts: Money[]
  pool: Money
}

export function calculateTrip(trip: Trip): TripResult {
  const warnings: string[] = []
  const known = new Map(trip.people.map((person) => [person.id, person]))
  const driver = trip.driverId ? known.get(trip.driverId) : undefined

  if (trip.driverId && !driver) warnings.push('The selected driver is no longer on the trip.')
  if (!driver) warnings.push('No driver is set, so nobody is collecting the money.')

  const perKm = trip.pricing.mode === 'per-km'

  // What is being divided, segment by segment. Pricing by the kilometre counts
  // no fuel at all, so the weights are money outright rather than a quantity
  // that money is derived from — `allocate` cannot tell the difference.
  const segmentEnergy = trip.segments.map((segment) => (perKm ? 0 : energyForSegment(segment, trip)))
  const energyTotal = segmentEnergy.reduce((sum, energy) => sum + energy, 0)
  const segmentFuelWeight = perKm
    ? trip.segments.map((segment) => costForSegment(segment, ratePerKm(trip)))
    : segmentEnergy
  const segmentDistance = trip.segments.map(distanceForSegment)

  // Who was in the car is decided once. It is a fact about people rather than
  // about money, and letting the fuel pot and the upkeep pot each work it out
  // is how the two could come to disagree about who rode which leg.
  const occupantsBySegment = trip.segments.map((segment, index) => {
    const occupants = dedupe(segment.occupantIds.filter((personId) => known.has(personId)))
    if (occupants.length > 0) return occupants

    const chargeable =
      (segmentFuelWeight[index] ?? 0) > 0 || (trip.maintenancePerKm > 0 && (segmentDistance[index] ?? 0) > 0)
    if (!chargeable) return occupants

    if (driver) {
      // Fuel nobody rode for is still fuel the driver bought.
      warnings.push(`"${segment.label}" has nobody assigned, so it falls to ${driver.name}.`)
      return [driver.id]
    }
    warnings.push(`"${segment.label}" has nobody assigned and there is no driver to absorb it.`)
    return occupants
  })

  const fuelPool = perKm ? sumMoney(segmentFuelWeight) : resolveFuelPool(trip, energyTotal, warnings)
  const fuel = spread(fuelPool, occupantsBySegment, segmentFuelWeight)

  const maintenancePool = Math.round(totalDistanceKm(trip) * positive(trip.maintenancePerKm))
  const maintenance = spread(maintenancePool, occupantsBySegment, segmentDistance)

  const fuelTotal = sumMoney(fuel.amounts)
  const maintenanceTotal = sumMoney(maintenance.amounts)

  if (fuelTotal !== fuelPool && fuelPool !== 0) {
    warnings.push('There is fuel cost with nobody to charge it to.')
  }
  if (maintenanceTotal !== maintenancePool && maintenancePool !== 0) {
    warnings.push('There is wear and tear with nobody to charge it to.')
  }
  if (perKm && ratePerKm(trip) <= 0 && trip.maintenancePerKm <= 0) {
    warnings.push('Set a price per km.')
  }

  const fuelByPerson = new Map<PersonId, Money>()
  const maintenanceByPerson = new Map<PersonId, Money>()
  const energyByPerson = new Map<PersonId, number>()
  const distanceByPerson = new Map<PersonId, number>()
  const segmentIdsByPerson = new Map<PersonId, Set<string>>()
  const sharesBySegment: Array<Record<PersonId, Money>> = trip.segments.map(() => ({}))

  const note = (personId: PersonId, segmentIndex: number, amount: Money) => {
    const segmentShares = sharesBySegment[segmentIndex]
    if (segmentShares) segmentShares[personId] = (segmentShares[personId] ?? 0) + amount

    const seen = segmentIdsByPerson.get(personId) ?? new Set<string>()
    const segment = trip.segments[segmentIndex]
    if (segment) seen.add(segment.id)
    segmentIdsByPerson.set(personId, seen)
  }

  fuel.claims.forEach((claim, index) => {
    const amount = fuel.amounts[index] ?? 0
    const occupants = occupantsBySegment[claim.segmentIndex]?.length || 1
    fuelByPerson.set(claim.personId, (fuelByPerson.get(claim.personId) ?? 0) + amount)
    energyByPerson.set(
      claim.personId,
      (energyByPerson.get(claim.personId) ?? 0) + (segmentEnergy[claim.segmentIndex] ?? 0) / occupants,
    )
    note(claim.personId, claim.segmentIndex, amount)
  })

  maintenance.claims.forEach((claim, index) => {
    const amount = maintenance.amounts[index] ?? 0
    const occupants = occupantsBySegment[claim.segmentIndex]?.length || 1
    maintenanceByPerson.set(claim.personId, (maintenanceByPerson.get(claim.personId) ?? 0) + amount)
    distanceByPerson.set(
      claim.personId,
      (distanceByPerson.get(claim.personId) ?? 0) + (segmentDistance[claim.segmentIndex] ?? 0) / occupants,
    )
    note(claim.personId, claim.segmentIndex, amount)
  })

  const overheadByPerson = new Map<PersonId, Money>()
  let overheadTotal = 0
  for (const cost of trip.overheadCosts) {
    const allocation = allocateOverhead(cost, trip.people)
    warnings.push(...allocation.warnings)
    overheadTotal += allocation.total
    for (const [personId, amount] of Object.entries(allocation.shares)) {
      overheadByPerson.set(personId, (overheadByPerson.get(personId) ?? 0) + amount)
    }
  }

  const totalExact = fuelTotal + maintenanceTotal + overheadTotal
  const exactByPerson = trip.people.map(
    (person) =>
      (fuelByPerson.get(person.id) ?? 0) +
      (maintenanceByPerson.get(person.id) ?? 0) +
      (overheadByPerson.get(person.id) ?? 0),
  )

  // The driver absorbs rounding: passengers pay whole units, the driver pays
  // whatever is left of the whole-unit trip total. Collected always equals
  // billed, and the drift never lands on a passenger.
  const targetPayable = roundToMajor(totalExact, trip.rounding)
  const payables = trip.people.map((person, index) =>
    driver && person.id === driver.id ? 0 : roundToMajor(exactByPerson[index] ?? 0, trip.rounding),
  )
  if (driver) {
    const driverIndex = trip.people.findIndex((person) => person.id === driver.id)
    if (driverIndex >= 0) payables[driverIndex] = targetPayable - sumMoney(payables)
  }

  const people: PersonBreakdown[] = trip.people.map((person, index) => ({
    personId: person.id,
    name: person.name,
    isDriver: person.id === driver?.id,
    energy: energyByPerson.get(person.id) ?? 0,
    distanceKm: distanceByPerson.get(person.id) ?? 0,
    fuelShare: fuelByPerson.get(person.id) ?? 0,
    maintenanceShare: maintenanceByPerson.get(person.id) ?? 0,
    overheadShare: overheadByPerson.get(person.id) ?? 0,
    exactTotal: exactByPerson[index] ?? 0,
    payable: payables[index] ?? 0,
    segmentIds: [...(segmentIdsByPerson.get(person.id) ?? [])],
  }))

  const segments: SegmentBreakdown[] = trip.segments.map((segment, index) => {
    const shares = sharesBySegment[index] ?? {}
    const occupants = occupantsBySegment[index] ?? []
    const energy = segmentEnergy[index] ?? 0
    const cost = sumMoney(Object.values(shares))
    return {
      segmentId: segment.id,
      label: segment.label,
      kind: segment.kind,
      energy,
      energyPerOccupant: occupants.length > 0 ? energy / occupants.length : 0,
      distanceKm: segmentDistance[index] ?? 0,
      occupantIds: occupants,
      cost,
      costPerOccupant: occupants.length > 0 ? Math.round(cost / occupants.length) : 0,
      shares,
    }
  })

  // A foreign amount with no usable rate converts to nothing, which is real
  // money quietly leaving the reconciliation. Said out loud rather than left
  // to be noticed as a total that looks slightly wrong.
  for (const entry of [...trip.receipts, ...trip.overheadCosts]) {
    if (entry.foreign && !(entry.foreign.rate > 0)) {
      warnings.push(
        `"${entry.label}" is in ${entry.foreign.currency} with no exchange rate, so it is not being counted.`,
      )
    }
  }

  const receiptsTotal = sumMoney(trip.receipts.map((receipt) => receipt.amount))
  const receiptsDelta = trip.pricing.mode === 'from-receipts' ? 0 : receiptsTotal - fuelTotal
  // With no receipts there is nothing to reconcile against, so saying the
  // charge exceeds them is noise on every new trip. The delta itself stays
  // truthful; only the warning waits until there is something to compare with.
  if (trip.receipts.length > 0 && Math.abs(receiptsDelta) >= 100) {
    warnings.push(
      receiptsDelta > 0
        ? 'The receipts are larger than the energy being charged out. The difference is coming out of the driver’s pocket.'
        : 'The energy being charged out is larger than the receipts on file.',
    )
  }

  const totalPayable = sumMoney(payables)

  return {
    totalEnergy: energyTotal,
    totalDistanceKm: totalDistanceKm(trip),
    fuelTotal,
    derivedPricePerUnit: energyTotal > 0 ? Math.round(fuelTotal / energyTotal) : 0,
    maintenanceTotal,
    overheadTotal,
    receiptsTotal,
    receiptsDelta,
    totalExact,
    totalPayable,
    roundingResidual: totalPayable - totalExact,
    collectFromOthers: sumMoney(people.filter((person) => !person.isDriver).map((person) => person.payable)),
    driverPayable: people.find((person) => person.isDriver)?.payable ?? 0,
    segments,
    people,
    warnings: dedupe(warnings),
  }
}

/**
 * Split one pot across the people who were there, segment by segment.
 *
 * Every (segment, person) stake is built up front and the money allocated
 * across them in one pass — rather than per segment and again per person —
 * which is what makes the two result tables incapable of disagreeing.
 */
function spread(pool: Money, occupantsBySegment: PersonId[][], weightBySegment: number[]): Spread {
  const claims: Claim[] = []
  const weights: number[] = []

  occupantsBySegment.forEach((occupants, segmentIndex) => {
    if (occupants.length === 0) return
    const each = (weightBySegment[segmentIndex] ?? 0) / occupants.length
    for (const personId of occupants) {
      claims.push({ segmentIndex, personId })
      weights.push(each)
    }
  })

  return { claims, amounts: allocate(pool, weights), pool }
}

function ratePerKm(trip: Trip): Money {
  return trip.pricing.mode === 'per-km' ? positive(trip.pricing.ratePerKm) : 0
}

function resolveFuelPool(trip: Trip, energyTotal: number, warnings: string[]): Money {
  if (trip.pricing.mode === 'from-receipts') {
    const receipts = sumMoney(trip.receipts.map((receipt) => receipt.amount))
    if (receipts === 0)
      warnings.push('Add a receipt — the price per unit is derived from what was actually spent.')
    if (energyTotal === 0 && receipts !== 0)
      warnings.push('There are receipts but no fuel used, so nothing can be split.')
    return energyTotal > 0 ? receipts : 0
  }

  if (trip.pricing.mode === 'fixed-price') {
    if (trip.pricing.pricePerUnit <= 0) warnings.push(`Set a price per ${unitLabelFor(trip.energyKind)}.`)
    return Math.round(energyTotal * trip.pricing.pricePerUnit)
  }

  return 0
}

function positive(value: number | undefined): number {
  return Number.isFinite(value) && (value as number) > 0 ? (value as number) : 0
}

function dedupe<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}
