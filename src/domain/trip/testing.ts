import { fromMajor } from '../money/money'
import type { DriveSegment, IdleSegment, Trip } from './types'

/** Test-only builders. Keeps the intent of each test visible instead of buried. */
export function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'trip-1',
    title: 'Test trip',
    currency: 'Kč',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    pricing: { mode: 'fixed-price', pricePerUnit: fromMajor(43) },
    energyKind: 'gasoline',
    consumptionPer100Km: 10,
    driverId: 'ann',
    people: [
      { id: 'ann', name: 'Ann' },
      { id: 'bo', name: 'Bo' },
      { id: 'cy', name: 'Cy' },
    ],
    routePoints: [],
    segments: [],
    overheadCosts: [],
    receipts: [],
    rounding: 'nearest',
    paidAt: {},
    ...overrides,
  }
}

export function makeDrive(overrides: Partial<DriveSegment> = {}): DriveSegment {
  return {
    kind: 'drive',
    id: 'drive-1',
    label: 'A → B',
    from: 'A',
    to: 'B',
    distanceKm: 100,
    distanceSource: 'manual',
    occupantIds: ['ann'],
    ...overrides,
  }
}

export function makeIdle(overrides: Partial<IdleSegment> = {}): IdleSegment {
  return { kind: 'idle', id: 'idle-1', label: 'Waiting', energy: 10, occupantIds: ['ann'], ...overrides }
}
