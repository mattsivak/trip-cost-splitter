import type { Segment, Trip } from './types'

/**
 * How many litres a segment consumed.
 *
 * A drive uses its own consumption figure if it has one, otherwise the trip
 * default. A measured `directLiters` beats both. Idle stops are always
 * measured — there is no distance to derive them from.
 */
export function litersForSegment(segment: Segment, trip: Pick<Trip, 'defaultConsumptionLPer100Km'>): number {
  if (segment.kind === 'idle') return positive(segment.liters)

  if (segment.directLiters !== undefined) return positive(segment.directLiters)

  const consumption = segment.consumptionLPer100Km ?? trip.defaultConsumptionLPer100Km
  return (positive(segment.distanceKm) * positive(consumption)) / 100
}

export function totalLiters(trip: Pick<Trip, 'segments' | 'defaultConsumptionLPer100Km'>): number {
  return trip.segments.reduce((sum, segment) => sum + litersForSegment(segment, trip), 0)
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
