import type { Trip } from '../trip/types'
import type { KeyValueStore } from './localTripStore'
import { summarize, type TripStore, type TripSummary } from './tripStore'

const INDEX_KEY = 'trip-cost-splitter:index'

export interface TripKeys {
  id: string
  viewKey: string
  editKey: string
}

export interface IndexEntry extends TripKeys, TripSummary {}

/** What this store needs from the API. Injected so it can be tested. */
export interface TripApi {
  create(trip: Trip): Promise<{ id: string; viewKey: string; editKey: string; trip: Trip }>
  read(id: string, key: string): Promise<{ trip: Trip } | null>
  update(id: string, key: string, trip: Trip): Promise<Trip>
  destroy(id: string, key: string): Promise<void>
}

/**
 * Trips on the server, with a local note of which ones are yours.
 *
 * There are no accounts, so the server cannot answer "list my trips" — it does
 * not know who is asking, and a listing endpoint would expose everybody's.
 * Instead the browser keeps an index of the trips it created, holding their
 * keys and enough summary to draw the list without a round trip each.
 *
 * Losing that index loses your way back to a trip, exactly as losing the link
 * would. That is the cost of having no accounts.
 */
export function createHttpTripStore(
  api: TripApi,
  storage: KeyValueStore,
): TripStore & {
  keysFor(id: string): TripKeys | null
  remember(entry: IndexEntry): void
} {
  function readIndex(): IndexEntry[] {
    try {
      const raw = storage.getItem(INDEX_KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed.filter(isEntry) : []
    } catch {
      return []
    }
  }

  function writeIndex(entries: IndexEntry[]): void {
    try {
      storage.setItem(INDEX_KEY, JSON.stringify(entries))
    } catch {
      // A browser refusing storage costs the list, not the trip.
    }
  }

  function remember(entry: IndexEntry): void {
    writeIndex([entry, ...readIndex().filter((existing) => existing.id !== entry.id)])
  }

  function forget(id: string): void {
    writeIndex(readIndex().filter((entry) => entry.id !== id))
  }

  return {
    keysFor(id) {
      const entry = readIndex().find((candidate) => candidate.id === id)
      return entry ? { id: entry.id, viewKey: entry.viewKey, editKey: entry.editKey } : null
    },

    remember,

    async list(): Promise<TripSummary[]> {
      return readIndex()
        .map(({ id, title, updatedAt, peopleCount, segmentCount }) => ({
          id,
          title,
          updatedAt,
          peopleCount,
          segmentCount,
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },

    async load(id: string): Promise<Trip | null> {
      const entry = readIndex().find((candidate) => candidate.id === id)
      if (!entry) return null

      const answer = await api.read(id, entry.editKey)
      if (!answer) {
        // Gone from the server: stop offering a trip that cannot be opened.
        forget(id)
        return null
      }
      return answer.trip
    },

    async save(trip: Trip): Promise<Trip> {
      const entry = readIndex().find((candidate) => candidate.id === trip.id)

      if (!entry) {
        const created = await api.create(trip)
        remember({ ...created, ...summarize(created.trip) })
        return created.trip
      }

      const saved = await api.update(trip.id, entry.editKey, trip)
      remember({ ...entry, ...summarize(saved) })
      return saved
    },

    async remove(id: string): Promise<void> {
      const entry = readIndex().find((candidate) => candidate.id === id)
      forget(id)
      if (entry) await api.destroy(id, entry.editKey)
    },
  }
}

function isEntry(value: unknown): value is IndexEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.id === 'string' &&
    typeof entry.viewKey === 'string' &&
    typeof entry.editKey === 'string' &&
    typeof entry.title === 'string'
  )
}

export const TRIP_INDEX_KEY = INDEX_KEY
