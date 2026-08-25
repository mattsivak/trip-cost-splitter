import { formatEnergy } from '../pricing/energyKind'
import type { EnergyStream, Segment, StreamId, Trip } from './types'

/** A quantity per stream. Zero or absent both mean "none of that one". */
export type EnergyMix = Record<StreamId, number>

/**
 * How much of one stream a segment consumed.
 *
 * A drive uses its own consumption figure for that stream if it has one,
 * otherwise the stream's trip-wide figure. A measured `directEnergy` beats
 * both — including a measured zero, which is how a leg says the engine never
 * ran. Idle stops are always measured; there is no distance to derive them
 * from.
 */
export function energyForSegment(segment: Segment, stream: EnergyStream): number {
  if (segment.kind === 'idle') return positive(segment.energy[stream.id])

  const direct = segment.directEnergy?.[stream.id]
  if (direct !== undefined) return positive(direct)

  const consumption = segment.consumptionPer100Km?.[stream.id] ?? stream.consumptionPer100Km
  return (positive(segment.distanceKm) * positive(consumption)) / 100
}

export function energyMixForSegment(segment: Segment, streams: readonly EnergyStream[]): EnergyMix {
  const mix: EnergyMix = {}
  for (const stream of streams) mix[stream.id] = energyForSegment(segment, stream)
  return mix
}

export function totalEnergy(trip: Pick<Trip, 'segments'>, stream: EnergyStream): number {
  return trip.segments.reduce((sum, segment) => sum + energyForSegment(segment, stream), 0)
}

export function totalEnergyMix(trip: Pick<Trip, 'segments' | 'streams'>): EnergyMix {
  const mix: EnergyMix = {}
  for (const stream of trip.streams) mix[stream.id] = totalEnergy(trip, stream)
  return mix
}

export function totalDistanceKm(trip: Pick<Trip, 'segments'>): number {
  return trip.segments.reduce(
    (sum, segment) => (segment.kind === 'drive' ? sum + positive(segment.distanceKm) : sum),
    0,
  )
}

/**
 * A mix written out for a human: "18.4 L + 30.0 kWh".
 *
 * Streams that contributed nothing are left out, so a hybrid trip that never
 * touched the battery reads exactly like the petrol-only trip it was. When
 * nothing at all was used, the first stream still reports its zero rather than
 * leaving a blank where a quantity belongs.
 */
export function formatEnergyMix(mix: EnergyMix, streams: readonly EnergyStream[]): string {
  const used = streams.filter((stream) => (mix[stream.id] ?? 0) > 0)
  const shown = used.length > 0 ? used : streams.slice(0, 1)
  return shown.map((stream) => formatEnergy(mix[stream.id] ?? 0, stream.kind)).join(' + ')
}

function positive(value: number | undefined): number {
  return Number.isFinite(value) && (value as number) > 0 ? (value as number) : 0
}
