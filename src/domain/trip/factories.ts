import { fromMajor } from '../money/money'
import { slugify } from '../routing/routeToSegments'
import type { DriveSegment, IdleSegment, Person, Trip } from './types'

/** Ids only need to be unique within one trip, not globally meaningful. */
export function createId(prefix: string): string {
  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}-${random}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function createTrip(overrides: Partial<Trip> = {}): Trip {
  const timestamp = nowIso()
  return {
    id: createId('trip'),
    title: 'New trip',
    currency: 'Kč',
    createdAt: timestamp,
    updatedAt: timestamp,
    pricing: { mode: 'from-receipts' },
    defaultConsumptionLPer100Km: 7,
    driverId: null,
    people: [],
    routePoints: [],
    segments: [],
    overheadCosts: [],
    receipts: [],
    rounding: 'nearest',
    ...overrides,
  }
}

export function createPerson(name: string): Person {
  return { id: createId(slugify(name)), name: name.trim() }
}

export function createDrive(from: string, to: string, overrides: Partial<DriveSegment> = {}): DriveSegment {
  return {
    kind: 'drive',
    id: createId('drive'),
    label: driveLabel(from, to),
    from,
    to,
    distanceKm: 0,
    distanceSource: 'manual',
    occupantIds: [],
    ...overrides,
  }
}

export function createIdle(location = '', overrides: Partial<IdleSegment> = {}): IdleSegment {
  return {
    kind: 'idle',
    id: createId('idle'),
    label: location ? `Waiting at ${location}` : 'Waiting',
    location,
    liters: 0,
    occupantIds: [],
    ...overrides,
  }
}

export function driveLabel(from: string, to: string): string {
  return `${from.trim() || 'Start'} → ${to.trim() || 'End'}`
}

export function createOverhead(label = 'Tolls', amountMajor = 0) {
  return {
    id: createId('overhead'),
    label,
    amount: fromMajor(amountMajor),
    allocation: { type: 'even' as const },
  }
}

export function createReceipt(label = 'Fuel', amountMajor = 0) {
  return { id: createId('receipt'), label, amount: fromMajor(amountMajor) }
}
