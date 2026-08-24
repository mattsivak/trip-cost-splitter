import { allocate, roundToMajor, sumMoney, type Money } from '../money/money'
import { unitLabelFor } from '../pricing/energyKind'
import { energyForSegment, totalDistanceKm } from './energy'
import { allocateOverhead } from './overhead'
import type { PersonBreakdown, SegmentBreakdown, TripResult } from './result'
import type { PersonId, Trip } from './types'

/** One person's stake in one segment. The unit the whole split is built from. */
interface Claim {
  segmentIndex: number
  personId: PersonId
  energy: number
}

export function calculateTrip(trip: Trip): TripResult {
  const warnings: string[] = []
  const known = new Map(trip.people.map((person) => [person.id, person]))
  const driver = trip.driverId ? known.get(trip.driverId) : undefined

  if (trip.driverId && !driver) warnings.push('The selected driver is no longer on the trip.')
  if (!driver) warnings.push('No driver is set, so nobody is collecting the money.')

  const segmentEnergy = trip.segments.map((segment) => energyForSegment(segment, trip))
  const energyTotal = segmentEnergy.reduce((sum, energy) => sum + energy, 0)

  // Build every (segment, person) stake up front. Allocating the money across
  // these once — rather than per segment and again per person — is what makes
  // the two result tables incapable of disagreeing with each other.
  const claims: Claim[] = []
  const occupantsBySegment: PersonId[][] = []

  trip.segments.forEach((segment, index) => {
    const energy = segmentEnergy[index] ?? 0
    const occupants = dedupe(segment.occupantIds.filter((personId) => known.has(personId)))

    if (occupants.length === 0) {
      if (energy > 0) {
        if (driver) {
          // Fuel nobody rode for is still fuel the driver bought.
          occupants.push(driver.id)
          warnings.push(`"${segment.label}" has nobody assigned, so it falls to ${driver.name}.`)
        } else {
          warnings.push(`"${segment.label}" has nobody assigned and there is no driver to absorb it.`)
        }
      }
    }

    occupantsBySegment[index] = occupants
    const perOccupant = occupants.length > 0 ? energy / occupants.length : 0
    for (const personId of occupants) claims.push({ segmentIndex: index, personId, energy: perOccupant })
  })

  const fuelPool = resolveFuelPool(trip, energyTotal, warnings)
  const claimAmounts = allocate(
    fuelPool,
    claims.map((claim) => claim.energy),
  )
  const fuelTotal = sumMoney(claimAmounts)

  if (fuelTotal !== fuelPool && fuelPool !== 0) {
    warnings.push('There is fuel cost with nobody to charge it to.')
  }

  const fuelByPerson = new Map<PersonId, Money>()
  const energyByPerson = new Map<PersonId, number>()
  const segmentIdsByPerson = new Map<PersonId, Set<string>>()
  const sharesBySegment: Array<Record<PersonId, Money>> = trip.segments.map(() => ({}))

  claims.forEach((claim, index) => {
    const amount = claimAmounts[index] ?? 0
    fuelByPerson.set(claim.personId, (fuelByPerson.get(claim.personId) ?? 0) + amount)
    energyByPerson.set(claim.personId, (energyByPerson.get(claim.personId) ?? 0) + claim.energy)

    const segmentShares = sharesBySegment[claim.segmentIndex]
    if (segmentShares) segmentShares[claim.personId] = (segmentShares[claim.personId] ?? 0) + amount

    const seen = segmentIdsByPerson.get(claim.personId) ?? new Set<string>()
    const segment = trip.segments[claim.segmentIndex]
    if (segment) seen.add(segment.id)
    segmentIdsByPerson.set(claim.personId, seen)
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

  const totalExact = fuelTotal + overheadTotal
  const exactByPerson = trip.people.map(
    (person) => (fuelByPerson.get(person.id) ?? 0) + (overheadByPerson.get(person.id) ?? 0),
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
    fuelShare: fuelByPerson.get(person.id) ?? 0,
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
      occupantIds: occupants,
      cost,
      costPerOccupant: occupants.length > 0 ? Math.round(cost / occupants.length) : 0,
      shares,
    }
  })

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

function resolveFuelPool(trip: Trip, energyTotal: number, warnings: string[]): Money {
  if (trip.pricing.mode === 'from-receipts') {
    const receipts = sumMoney(trip.receipts.map((receipt) => receipt.amount))
    if (receipts === 0)
      warnings.push('Add a receipt — the price per unit is derived from what was actually spent.')
    if (energyTotal === 0 && receipts !== 0)
      warnings.push('There are receipts but no fuel used, so nothing can be split.')
    return energyTotal > 0 ? receipts : 0
  }

  if (trip.pricing.pricePerUnit <= 0) warnings.push(`Set a price per ${unitLabelFor(trip.energyKind)}.`)
  return Math.round(energyTotal * trip.pricing.pricePerUnit)
}

function dedupe<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}
