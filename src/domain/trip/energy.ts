import type { Money } from '../money/money'
import type { Segment, Trip } from './types'

/**
 * How much energy a segment consumed, in the trip's unit.
 *
 * A drive uses its own consumption figure if it has one, otherwise the trip
 * default. A measured `directEnergy` beats both. Idle stops are always
 * measured — there is no distance to derive them from.
 */
export function energyForSegment(segment: Segment, trip: Pick<Trip, 'consumptionPer100Km'>): number {
  if (segment.kind === 'idle') return positive(segment.energy)

  if (segment.directEnergy !== undefined) return positive(segment.directEnergy)

  const consumption = segment.consumptionPer100Km ?? trip.consumptionPer100Km
  return (positive(segment.distanceKm) * positive(consumption)) / 100
}

export function totalEnergy(trip: Pick<Trip, 'segments' | 'consumptionPer100Km'>): number {
  return trip.segments.reduce((sum, segment) => sum + energyForSegment(segment, trip), 0)
}

/**
 * What one segment contributes to the driving pot when the trip is priced by
 * the kilometre. A drive is its distance at the stated rate; an idle stop is
 * whatever the waiting was said to cost, since it has no distance to charge.
 */
export function costForSegment(segment: Segment, ratePerKm: Money): Money {
  if (segment.kind === 'idle') return Math.round(positive(segment.cost))
  return Math.round(positive(segment.distanceKm) * positive(ratePerKm))
}

/** Kilometres this segment puts on the car. Idle stops put on none. */
export function distanceForSegment(segment: Segment): number {
  return segment.kind === 'drive' ? positive(segment.distanceKm) : 0
}

export function totalDistanceKm(trip: Pick<Trip, 'segments'>): number {
  return trip.segments.reduce(
    (sum, segment) => (segment.kind === 'drive' ? sum + positive(segment.distanceKm) : sum),
    0,
  )
}

function positive(value: number | undefined): number {
  return Number.isFinite(value) && (value as number) > 0 ? (value as number) : 0
}
