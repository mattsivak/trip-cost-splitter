import { nowIso } from '../trip/factories'
import type { Trip } from '../trip/types'
import { parseTrip } from './serialization'
import { summarize, type TripStore, type TripSummary } from './tripStore'

const PREFIX = 'trip-cost-splitter:trip:'

/** The subset of the Web Storage API this store needs. */
export interface KeyValueStore {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/**
 * Browser-local persistence. Corrupt entries are skipped rather than thrown,
 * so one bad record cannot make the whole trip list unopenable.
 */
export function createLocalTripStore(storage: KeyValueStore): TripStore {
  function readAll(): Trip[] {
    const trips: Trip[] = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (!key?.startsWith(PREFIX)) continue

      const trip = readKey(key)
      if (trip) trips.push(trip)
    }
    return trips
  }

  function readKey(key: string): Trip | null {
    const raw = storage.getItem(key)
    if (!raw) return null
    try {
      return parseTrip(JSON.parse(raw))
    } catch {
      return null
    }
  }

  return {
    async list(): Promise<TripSummary[]> {
      return readAll()
        .map(summarize)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },

    async load(id: string): Promise<Trip | null> {
      return readKey(PREFIX + id)
    },

    async save(trip: Trip): Promise<Trip> {
      const stamped: Trip = { ...trip, updatedAt: nowIso() }
      storage.setItem(PREFIX + stamped.id, JSON.stringify(stamped))
      return stamped
    },

    async remove(id: string): Promise<void> {
      storage.removeItem(PREFIX + id)
    },
  }
}

/** An in-memory stand-in, for tests and for server-side rendering. */
export function createMemoryStorage(seed: Record<string, string> = {}): KeyValueStore {
  const map = new Map(Object.entries(seed))
  return {
    get length() {
      return map.size
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

export const TRIP_KEY_PREFIX = PREFIX
