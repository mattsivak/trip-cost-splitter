import type { Money } from '../money/money'
import type { Segment, Trip, TripLine } from './types'

/** The lines people rode: drives and stops. The rest of the ledger is money. */
export function ridden(lines: readonly TripLine[]): Segment[] {
  return lines.filter((line): line is Segment => line.kind === 'drive' || line.kind === 'stop')
}

/** The lines that are money somebody spent. */
export function bought(lines: readonly TripLine[]) {
  return lines.filter((line) => line.kind === 'buy')
}

/**
 * How much energy a segment consumed, in the trip's unit.
 *
 * A drive uses its own consumption figure if it has one, otherwise the trip
 * default. A measured `directEnergy` beats both. Stops are always measured —
 * there is no distance to derive them from.
 */
export function energyForSegment(segment: Segment, trip: Pick<Trip, 'consumptionPer100Km'>): number {
  if (segment.kind === 'stop') return positive(segment.energy)

  if (segment.directEnergy !== undefined) return positive(segment.directEnergy)

  const consumption = segment.consumptionPer100Km ?? trip.consumptionPer100Km
  return (positive(segment.distanceKm) * positive(consumption)) / 100
}

export function totalEnergy(trip: Pick<Trip, 'lines' | 'consumptionPer100Km'>): number {
  return ridden(trip.lines).reduce((sum, segment) => sum + energyForSegment(segment, trip), 0)
}

/**
 * What one segment contributes to the driving pot when the trip is priced by
 * the kilometre. A drive is its distance at the stated rate; a stop is whatever
 * the waiting was said to cost, since it has no distance to charge.
 *
 * A line priced by hand answers for itself in either mode — that is what
 * carrying its own charge means.
 */
export function costForSegment(segment: Segment, ratePerKm: Money): Money {
  if (segment.charge?.mode === 'money') return Math.round(positive(segment.charge.amount))
  if (segment.charge?.mode === 'per-km') {
    return Math.round(positive(distanceForSegment(segment)) * positive(segment.charge.ratePerKm))
  }
  if (segment.kind === 'stop') return 0
  return Math.round(positive(segment.distanceKm) * positive(ratePerKm))
}

/** Kilometres this segment puts on the car. Stops put on none. */
export function distanceForSegment(segment: Segment): number {
  return segment.kind === 'drive' ? positive(segment.distanceKm) : 0
}

export function totalDistanceKm(trip: Pick<Trip, 'lines'>): number {
  return ridden(trip.lines).reduce(
    (sum, segment) => (segment.kind === 'drive' ? sum + positive(segment.distanceKm) : sum),
    0,
  )
}

function positive(value: number | undefined): number {
  return Number.isFinite(value) && (value as number) > 0 ? (value as number) : 0
}
