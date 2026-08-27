import { fromMajor } from '../money/money'
import type { BuyLine, DriveLine, StopLine, Trip } from './types'

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
    maintenancePerKm: 0,
    driverId: 'ann',
    people: [
      { id: 'ann', name: 'Ann' },
      { id: 'bo', name: 'Bo' },
      { id: 'cy', name: 'Cy' },
    ],
    routePoints: [],
    lines: [],
    rounding: 'nearest',
    paidAt: {},
    ...overrides,
  }
}

export function makeDrive(overrides: Partial<DriveLine> = {}): DriveLine {
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

export function makeStop(overrides: Partial<StopLine> = {}): StopLine {
  return { kind: 'stop', id: 'stop-1', label: 'Waiting', energy: 10, occupantIds: ['ann'], ...overrides }
}

/** Money spent. Fuel pays for the driving; anything else is shared out. */
export function makeBuy(overrides: Partial<BuyLine> = {}): BuyLine {
  return {
    kind: 'buy',
    id: 'buy-1',
    label: 'Fuel',
    amount: 0,
    funds: 'fuel',
    allocation: { type: 'even' },
    ...overrides,
  }
}
