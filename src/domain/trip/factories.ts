import { fromMajor } from '../money/money'
import { slugify } from '../routing/routeToSegments'
import type { BuyLine, DriveLine, Person, StopLine, Trip } from './types'

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
    pricing: { mode: 'fixed-price', pricePerUnit: 0 },
    energyKind: 'gasoline',
    consumptionPer100Km: 7,
    // Off until somebody says otherwise: most people splitting a trip are
    // splitting fuel, not billing each other for the car.
    maintenancePerKm: 0,
    driverId: null,
    people: [],
    routePoints: [],
    lines: [],
    rounding: 'nearest',
    paidAt: {},
    ...overrides,
  }
}

export function createPerson(name: string): Person {
  return { id: createId(slugify(name)), name: name.trim() }
}

export function createDrive(from: string, to: string, overrides: Partial<DriveLine> = {}): DriveLine {
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

export function createStop(location = '', overrides: Partial<StopLine> = {}): StopLine {
  return {
    kind: 'stop',
    id: createId('stop'),
    label: location ? `Waiting at ${location}` : 'Waiting',
    location,
    energy: 0,
    occupantIds: [],
    ...overrides,
  }
}

export function driveLabel(from: string, to: string): string {
  return `${from.trim() || 'Start'} → ${to.trim() || 'End'}`
}

/**
 * Money spent. `funds` is the whole difference between a tank of fuel and a
 * round of coffees: the first pays for the driving, the second is shared out.
 */
export function createBuy(label = '', amountMajor = 0, funds: BuyLine['funds'] = 'fuel'): BuyLine {
  return {
    kind: 'buy',
    id: createId('buy'),
    label,
    amount: fromMajor(amountMajor),
    funds,
    allocation: { type: 'even' as const },
  }
}
