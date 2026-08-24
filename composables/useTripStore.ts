import {
  createHttpTripStore,
  type IndexEntry,
  type TripApi,
  type TripKeys,
} from '~/src/domain/storage/httpTripStore'
import {
  createLocalTripStore,
  createMemoryStorage,
  TRIP_KEY_PREFIX,
} from '~/src/domain/storage/localTripStore'
import { summarize } from '~/src/domain/storage/tripStore'
import type { Trip } from '~/src/domain/trip/types'

// Paths are typed as plain strings so Nitro does not try to infer each route's
// shape; that inference recurses too deeply on parameterised routes.
const TRIPS: string = '/api/trips'
const tripPath = (id: string): string => `${TRIPS}/${encodeURIComponent(id)}`

const api: TripApi = {
  async create(trip) {
    return await $fetch<{ id: string; viewKey: string; editKey: string; trip: Trip }>(TRIPS, {
      method: 'POST',
      body: { trip },
    })
  },
  async read(id, key) {
    try {
      return await $fetch<{ trip: Trip }>(tripPath(id), { query: { key } })
    } catch {
      return null
    }
  },
  async update(id, key, trip) {
    const answer = await $fetch<{ trip: Trip }>(tripPath(id), { method: 'PUT', body: { key, trip } })
    return answer.trip
  },
  async destroy(id, key) {
    await $fetch(tripPath(id), { method: 'DELETE', query: { key } })
  },
}

function storage() {
  return import.meta.client ? window.localStorage : createMemoryStorage()
}

/**
 * Trips live on the server so a shared link can show the same thing to
 * everyone, and so marking yourself paid is visible to the person collecting.
 * The browser keeps only an index of which trips are yours and the keys that
 * open them.
 */
export function useTripStore() {
  return createHttpTripStore(api, storage())
}

export function tripKeysFor(id: string): TripKeys | null {
  return useTripStore().keysFor(id)
}

/**
 * Move trips saved by the browser-only version onto the server.
 *
 * Runs once, on the trip list. A trip that fails to upload is left where it is
 * rather than dropped, so a bad network costs a retry and not the data.
 */
export async function migrateLocalTrips(): Promise<number> {
  if (!import.meta.client) return 0

  const legacy = createLocalTripStore(window.localStorage)
  const summaries = await legacy.list()
  if (summaries.length === 0) return 0

  const store = useTripStore()
  let moved = 0

  for (const summary of summaries) {
    const trip: Trip | null = await legacy.load(summary.id)
    if (!trip) continue

    try {
      const created = await api.create(trip)
      const entry: IndexEntry = { ...created, ...summarize(created.trip) }
      store.remember(entry)
      window.localStorage.removeItem(`${TRIP_KEY_PREFIX}${summary.id}`)
      moved += 1
    } catch {
      // Leave it local; the next visit can try again.
    }
  }

  return moved
}
