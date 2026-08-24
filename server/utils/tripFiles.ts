import { createTripRecord, parseTripRecord, type TripRecord } from '../../src/domain/storage/tripRecord'
import { nowIso } from '../../src/domain/trip/factories'
import type { Trip } from '../../src/domain/trip/types'

/**
 * Trips on disk, one JSON file each.
 *
 * Nitro's storage layer is already here, so this needs no database and no
 * dependency. Files are trivially inspectable, backed up with cp and deleted
 * with rm, which at this scale is a feature.
 */
const BASE = 'trips'

function storage() {
  return useStorage(BASE)
}

export async function readTrip(id: string): Promise<TripRecord | null> {
  if (!isTripId(id)) return null
  return parseTripRecord(await storage().getItem(key(id)))
}

export async function writeTrip(id: string, record: TripRecord): Promise<void> {
  await storage().setItem(key(id), record)
}

export async function deleteTrip(id: string): Promise<void> {
  if (!isTripId(id)) return
  await storage().removeItem(key(id))
}

export async function createTrip(trip: Trip): Promise<TripRecord> {
  const record = createTripRecord(trip, nowIso())
  await writeTrip(record.trip.id, record)
  return record
}

/**
 * Ids come from the client, so they must never be able to name a path outside
 * the trips directory.
 */
export function isTripId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id)
}

function key(id: string): string {
  return `${id}.json`
}
