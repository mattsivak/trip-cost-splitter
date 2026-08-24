import { createLocalTripStore, createMemoryStorage } from '~/src/domain/storage/localTripStore'
import type { TripStore } from '~/src/domain/storage/tripStore'

/**
 * Trips live in the browser. On the server there is no storage, so we hand
 * back an empty one rather than branching at every call site — the page
 * re-reads once it is mounted.
 */
export function useTripStore(): TripStore {
  return createLocalTripStore(import.meta.client ? window.localStorage : createMemoryStorage())
}
