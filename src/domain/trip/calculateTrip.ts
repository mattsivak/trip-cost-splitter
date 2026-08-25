import { allocate, roundToMajor, sumMoney, type Money } from '../money/money'
import { ENERGY_KIND_LABELS, unitLabelFor } from '../pricing/energyKind'
import { energyForSegment, totalDistanceKm, type EnergyMix } from './energy'
import { allocateOverhead } from './overhead'
import type { PersonBreakdown, SegmentBreakdown, StreamBreakdown, TripResult } from './result'
import type { EnergyStream, PersonId, Trip } from './types'

/** One person's stake in one segment, for one stream. The unit the split is built from. */
interface Claim {
  segmentIndex: number
  personId: PersonId
  energy: number
}

/** Everything one stream contributes, worked out in isolation from the others. */
interface StreamPass {
  stream: EnergyStream
  /** Quantity per segment, in this stream's unit. */
  perSegment: number[]
  quantity: number
  claims: Claim[]
  /** Money for each claim, summing to exactly `pool`. */
  amounts: Money[]
  pool: Money
}

export function calculateTrip(trip: Trip): TripResult {
  const warnings: string[] = []
  const known = new Map(trip.people.map((person) => [person.id, person]))
  const driver = trip.driverId ? known.get(trip.driverId) : undefined

  if (trip.driverId && !driver) warnings.push('The selected driver is no longer on the trip.')
  if (!driver) warnings.push('No driver is set, so nobody is collecting the money.')
  if (trip.streams.length === 0) warnings.push('The car runs on nothing — add an energy source.')

  // Who was in the car is decided once, for all streams. Occupancy is a fact
  // about people, not about energy, and letting each stream re-derive it is
  // how the petrol table and the electric table would come to disagree about
  // who rode which leg.
  const occupantsBySegment = resolveOccupancy(trip, known, driver?.id, driver?.name, warnings)

  const passes: StreamPass[] = trip.streams.map((stream) =>
    runStream(trip, stream, occupantsBySegment, warnings),
  )

  const fuelTotal = sumMoney(passes.flatMap((pass) => pass.amounts))
  const pooled = sumMoney(passes.map((pass) => pass.pool))
  if (fuelTotal !== pooled && pooled !== 0) {
    warnings.push('There is fuel cost with nobody to charge it to.')
  }

  const fuelByPerson = new Map<PersonId, Money>()
  const energyByPerson = new Map<PersonId, EnergyMix>()
  const segmentIdsByPerson = new Map<PersonId, Set<string>>()
  const sharesBySegment: Array<Record<PersonId, Money>> = trip.segments.map(() => ({}))

  for (const pass of passes) {
    pass.claims.forEach((claim, index) => {
      const amount = pass.amounts[index] ?? 0
      fuelByPerson.set(claim.personId, (fuelByPerson.get(claim.personId) ?? 0) + amount)

      const mix = energyByPerson.get(claim.personId) ?? {}
      mix[pass.stream.id] = (mix[pass.stream.id] ?? 0) + claim.energy
      energyByPerson.set(claim.personId, mix)

      const segmentShares = sharesBySegment[claim.segmentIndex]
      if (segmentShares) segmentShares[claim.personId] = (segmentShares[claim.personId] ?? 0) + amount

      const seen = segmentIdsByPerson.get(claim.personId) ?? new Set<string>()
      const segment = trip.segments[claim.segmentIndex]
      if (segment) seen.add(segment.id)
      segmentIdsByPerson.set(claim.personId, seen)
    })
  }

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
    energy: fill(energyByPerson.get(person.id) ?? {}, trip.streams),
    fuelShare: fuelByPerson.get(person.id) ?? 0,
    overheadShare: overheadByPerson.get(person.id) ?? 0,
    exactTotal: exactByPerson[index] ?? 0,
    payable: payables[index] ?? 0,
    segmentIds: [...(segmentIdsByPerson.get(person.id) ?? [])],
  }))

  const segments: SegmentBreakdown[] = trip.segments.map((segment, index) => {
    const shares = sharesBySegment[index] ?? {}
    const occupants = occupantsBySegment[index] ?? []
    const energy: EnergyMix = {}
    const energyPerOccupant: EnergyMix = {}
    for (const pass of passes) {
      const quantity = pass.perSegment[index] ?? 0
      energy[pass.stream.id] = quantity
      energyPerOccupant[pass.stream.id] = occupants.length > 0 ? quantity / occupants.length : 0
    }
    const cost = sumMoney(Object.values(shares))
    return {
      segmentId: segment.id,
      label: segment.label,
      kind: segment.kind,
      energy,
      energyPerOccupant,
      occupantIds: occupants,
      cost,
      costPerOccupant: occupants.length > 0 ? Math.round(cost / occupants.length) : 0,
      shares,
    }
  })

  const streams: StreamBreakdown[] = passes.map((pass) => {
    const cost = sumMoney(pass.amounts)
    return {
      streamId: pass.stream.id,
      kind: pass.stream.kind,
      billed: pass.stream.billed,
      quantity: pass.quantity,
      cost,
      derivedPricePerUnit: pass.quantity > 0 ? Math.round(cost / pass.quantity) : 0,
    }
  })

  const totalEnergy: EnergyMix = {}
  for (const pass of passes) totalEnergy[pass.stream.id] = pass.quantity

  const receiptsTotal = sumMoney(trip.receipts.map((receipt) => receipt.amount))
  const receiptsDelta = trip.pricingMode === 'from-receipts' ? 0 : receiptsTotal - fuelTotal
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
    totalEnergy,
    totalDistanceKm: totalDistanceKm(trip),
    streams,
    fuelTotal,
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
 * Who is on the hook for each segment, before any energy is priced.
 *
 * A segment nobody was assigned to still burned something, so it falls to the
 * driver — who bought it — rather than vanishing.
 */
function resolveOccupancy(
  trip: Trip,
  known: ReadonlyMap<PersonId, unknown>,
  driverId: PersonId | undefined,
  driverName: string | undefined,
  warnings: string[],
): PersonId[][] {
  return trip.segments.map((segment) => {
    const occupants = dedupe(segment.occupantIds.filter((personId) => known.has(personId)))
    if (occupants.length > 0) return occupants

    const usedSomething = trip.streams.some((stream) => energyForSegment(segment, stream) > 0)
    if (!usedSomething) return occupants

    if (driverId) {
      warnings.push(`"${segment.label}" has nobody assigned, so it falls to ${driverName}.`)
      return [driverId]
    }
    warnings.push(`"${segment.label}" has nobody assigned and there is no driver to absorb it.`)
    return occupants
  })
}

function runStream(
  trip: Trip,
  stream: EnergyStream,
  occupantsBySegment: PersonId[][],
  warnings: string[],
): StreamPass {
  const perSegment = trip.segments.map((segment) => energyForSegment(segment, stream))
  const quantity = perSegment.reduce((sum, energy) => sum + energy, 0)

  const claims: Claim[] = []
  trip.segments.forEach((_segment, index) => {
    const occupants = occupantsBySegment[index] ?? []
    if (occupants.length === 0) return
    const perOccupant = (perSegment[index] ?? 0) / occupants.length
    for (const personId of occupants) claims.push({ segmentIndex: index, personId, energy: perOccupant })
  })

  const pool = resolvePool(trip, stream, quantity, warnings)
  const amounts = allocate(
    pool,
    claims.map((claim) => claim.energy),
  )
  return { stream, perSegment, quantity, claims, amounts, pool }
}

function resolvePool(trip: Trip, stream: EnergyStream, quantity: number, warnings: string[]): Money {
  // An unbilled stream is still measured and still attributed to whoever was
  // in the car — it just costs them nothing. This is the home-charged battery.
  if (!stream.billed) return 0

  if (trip.pricingMode === 'from-receipts') {
    const billed = trip.streams.filter((candidate) => candidate.billed)
    if (billed.length > 1) {
      warnings.push(
        'Receipts cannot be split between two energy sources on their own. Only ' +
          `${ENERGY_KIND_LABELS[billed[0]!.kind].toLowerCase()} is being priced from them — ` +
          'set a price per unit on the others, or stop billing them.',
      )
      // The whole receipts pot goes to the first billed stream and nothing to
      // the rest, so "collected equals spent" survives a situation the mode
      // cannot actually express.
      if (billed[0]?.id !== stream.id) return 0
    }

    const receipts = sumMoney(trip.receipts.map((receipt) => receipt.amount))
    if (receipts === 0)
      warnings.push('Add a receipt — the price per unit is derived from what was actually spent.')
    if (quantity === 0 && receipts !== 0)
      warnings.push('There are receipts but no fuel used, so nothing can be split.')
    return quantity > 0 ? receipts : 0
  }

  if (stream.pricePerUnit <= 0) {
    const unit = unitLabelFor(stream.kind)
    warnings.push(
      trip.streams.length > 1
        ? `Set a price per ${unit} for ${ENERGY_KIND_LABELS[stream.kind].toLowerCase()}, or stop billing it.`
        : `Set a price per ${unit}.`,
    )
  }
  return Math.round(quantity * stream.pricePerUnit)
}

/** Give every stream an entry, so a zero reads as zero rather than as absent. */
function fill(mix: EnergyMix, streams: readonly EnergyStream[]): EnergyMix {
  const filled: EnergyMix = {}
  for (const stream of streams) filled[stream.id] = mix[stream.id] ?? 0
  return filled
}

function dedupe<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}
