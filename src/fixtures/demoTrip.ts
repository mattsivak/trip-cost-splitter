import { fromMajor } from '../domain/money/money'
import type { Trip } from '../domain/trip/types'

/**
 * The trip this app was originally built to settle, kept as a demo so the
 * calculator has something real to chew on.
 *
 * Every distance here is a genuine road distance and every receipt is a real
 * amount. The occupancy of the idle stop is a reconstruction — the canister
 * was burned while waiting at Milovice, and this is the group that was there.
 *
 * Loaded on demand from the trip list. It is deliberately NOT the app's
 * starting state: nobody else's default should be somebody's August holiday.
 */
export function createDemoTrip(): Trip {
  return {
    id: 'demo-volkswagen-august',
    title: 'Volkswagen August trip',
    currency: 'Kč',
    createdAt: '2025-08-24T00:00:00.000Z',
    updatedAt: '2025-08-24T00:00:00.000Z',

    // Fixed price on purpose: at the real pump price the receipts come to far
    // more than the mileage accounts for, and the app should say so out loud.
    // Switch to `from-receipts` to see the whole 6 893,73 Kč divided instead.
    pricing: { mode: 'fixed-price', pricePerLiter: fromMajor(43) },
    defaultConsumptionLPer100Km: 9.5,
    rounding: 'nearest',
    driverId: 'matthew',

    people: [
      { id: 'matthew', name: 'Matthew' },
      { id: 'terka', name: 'Terka' },
      { id: 'janca', name: 'Janča' },
      { id: 'lucis', name: 'Lucis' },
      { id: 'anet', name: 'Anet' },
      { id: 'vena', name: 'Véna' },
      { id: 'ondrej', name: 'Ondřej' },
      { id: 'maruska', name: 'Maruška' },
    ],

    routePoints: [
      { id: 'p1', label: 'Šumperk', query: 'Šumperk' },
      { id: 'p2', label: 'Olomouc', query: 'Olomouc' },
      { id: 'p3', label: 'Milovice', query: 'Milovice' },
      { id: 'p4', label: 'Vsetín', query: 'Vsetín' },
      { id: 'p5', label: 'Kunčice', query: 'Kunčice pod Ondřejníkem' },
    ],

    segments: [
      drive('d1', 'Šumperk', 'Olomouc', 65.2, ['matthew']),
      drive('d2', 'Olomouc', 'Milovice', 246.2, ['matthew', 'terka', 'janca', 'anet']),
      idleStop('i1', 'Milovice', 20, ['matthew', 'terka', 'janca', 'anet', 'lucis', 'vena']),
      drive('d3', 'Milovice', 'Olomouc', 246.2, ['matthew', 'terka', 'janca', 'anet', 'lucis', 'vena']),
      drive('d4', 'Olomouc', 'Vsetín', 100.4, ['matthew', 'terka', 'janca']),
      drive('d5', 'Vsetín', 'Kunčice', 47.8, ['matthew', 'terka', 'janca', 'lucis', 'ondrej', 'maruska']),
      drive('d6', 'Kunčice', 'Olomouc', 93.4, ['matthew', 'terka', 'lucis']),
      drive('d7', 'Olomouc', 'Šumperk', 58.9, ['matthew']),
    ],

    overheadCosts: [],

    receipts: [
      { id: 'r1', label: 'Visible fuel purchases', amount: fromMajor(6033.73) },
      { id: 'r2', label: 'Canister, ~20 L', amount: fromMajor(860) },
    ],
  }
}

function drive(id: string, from: string, to: string, distanceKm: number, occupantIds: string[]) {
  return {
    kind: 'drive' as const,
    id,
    label: `${from} → ${to}`,
    from,
    to,
    distanceKm,
    distanceSource: 'imported' as const,
    occupantIds,
  }
}

function idleStop(id: string, location: string, liters: number, occupantIds: string[]) {
  return {
    kind: 'idle' as const,
    id,
    label: `Canister burned waiting at ${location}`,
    location,
    liters,
    occupantIds,
  }
}
