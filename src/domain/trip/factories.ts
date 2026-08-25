import { fromMajor } from '../money/money'
import type { EnergyKind } from '../pricing/energyKind'
import { slugify } from '../routing/routeToSegments'
import type { DriveSegment, EnergyStream, IdleSegment, Person, Trip } from './types'

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
    // Fixed price by default, prefilled from the local pump price where we can
    // work out the country. `from-receipts` is the deliberate alternative.
    pricingMode: 'fixed-price',
    streams: [createStream('gasoline')],
    driverId: null,
    people: [],
    routePoints: [],
    segments: [],
    overheadCosts: [],
    receipts: [],
    rounding: 'nearest',
    paidAt: {},
    ...overrides,
  }
}

/**
 * A new energy source. Billed by default, because the ordinary reason to add
 * one is that somebody is paying for it; the home-charged battery is the case
 * you turn off by hand.
 */
export function createStream(kind: EnergyKind, overrides: Partial<EnergyStream> = {}): EnergyStream {
  return {
    id: createId('stream'),
    kind,
    consumptionPer100Km: defaultConsumption(kind),
    pricePerUnit: 0,
    billed: true,
    ...overrides,
  }
}

/** A plausible starting figure so the trip totals something before you tune it. */
function defaultConsumption(kind: EnergyKind): number {
  return kind === 'electric' ? 18 : 7
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
    energy: {},
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
