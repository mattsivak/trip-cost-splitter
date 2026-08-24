import type { Trip } from '../trip/types'

export interface TripSummary {
  id: string
  title: string
  updatedAt: string
  peopleCount: number
  segmentCount: number
}

/**
 * Where trips live.
 *
 * Every method is async even though the local implementation answers
 * immediately. That is deliberate: swapping in an HTTP-backed store later
 * must not require touching a single caller.
 */
export interface TripStore {
  list(): Promise<TripSummary[]>
  load(id: string): Promise<Trip | null>
  save(trip: Trip): Promise<Trip>
  remove(id: string): Promise<void>
}

export function summarize(trip: Trip): TripSummary {
  return {
    id: trip.id,
    title: trip.title,
    updatedAt: trip.updatedAt,
    peopleCount: trip.people.length,
    segmentCount: trip.segments.length,
  }
}
