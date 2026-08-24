import type { Trip } from '../trip/types'
import { parseTrip } from './serialization'

/**
 * What actually gets written to disk.
 *
 * The version is stamped so a stored trip can be recognised and migrated by a
 * later release rather than guessed at. Bump it whenever the stored shape
 * changes in a way `parseTrip` cannot absorb on its own, and add a step to
 * `migrate`.
 */
export const TRIP_SCHEMA_VERSION = 1

export interface TripRecord {
  version: number
  /** Lets a holder read the trip and mark themselves paid. Shared. */
  viewKey: string
  /** Lets a holder change anything. Kept by whoever made the trip. */
  editKey: string
  createdAt: string
  trip: Trip
}

export type TripAccess = 'view' | 'edit' | null

export function createTripRecord(trip: Trip, now: string): TripRecord {
  return {
    version: TRIP_SCHEMA_VERSION,
    viewKey: createKey(),
    editKey: createKey(),
    createdAt: now,
    trip,
  }
}

/**
 * 32 hex characters from the platform CSPRNG — 128 bits, so a link is not
 * worth guessing at. These keys are the only thing standing between a trip and
 * anyone who wants to read or rewrite it, so they are not built from a
 * timestamp or Math.random.
 */
export function createKey(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function parseTripRecord(value: unknown): TripRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  const trip = parseTrip(migrate(record).trip)
  if (!trip) return null

  const viewKey = text(record.viewKey)
  const editKey = text(record.editKey)
  if (!viewKey || !editKey) return null

  return {
    version: TRIP_SCHEMA_VERSION,
    viewKey,
    editKey,
    createdAt: text(record.createdAt) || trip.createdAt,
    trip,
  }
}

/**
 * Bring an older stored shape up to the current one.
 *
 * Nothing to do yet — version 1 is the first. It exists so the next change has
 * an obvious place to go, and so an unversioned file is recognisable.
 */
function migrate(record: Record<string, unknown>): Record<string, unknown> {
  return record
}

/** Which of the two keys, if either, this one is. Edit implies view. */
export function accessFor(record: TripRecord, key: string): TripAccess {
  const candidate = key.trim()
  if (!candidate) return null
  if (timingSafeEqual(candidate, record.editKey)) return 'edit'
  if (timingSafeEqual(candidate, record.viewKey)) return 'view'
  return null
}

/** Constant-time within a length, so a wrong key does not leak its prefix. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return diff === 0
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
