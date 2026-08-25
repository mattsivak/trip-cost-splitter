import { fromMajor } from '../domain/money/money'
import { createId } from '../domain/trip/factories'
import type { Trip } from '../domain/trip/types'

/**
 * The trip this app was originally built to settle, kept as a demo so the
 * calculator has something real to chew on.
 *
 * The receipts are real amounts. The distances are real road distances, taken
 * from OSRM's car profile for each pair of stops — the app's own routing, so
 * clicking "Look up the route" reproduces them.
 *
 * They replaced a hardcoded table from the app's first version that ran about
 * 9% high and contradicted itself, billing Šumperk → Olomouc at 65.2 km and
 * the identical return leg at 58.9.
 *
 * The occupancy of the idle stop is a reconstruction — the canister was
 * burned while waiting at Milovice, and this is the group that was there.
 *
 * Loaded on demand from the trip list. It is deliberately NOT the app's
 * starting state: nobody else's default should be somebody's August holiday.
 */
export function createDemoTrip(): Trip {
  return {
    // A fresh id each time. With a fixed one, every person who opened the
    // example on a shared server would write over the same trip and inherit
    // somebody else's keys.
    id: createId('demo'),
    title: 'Volkswagen August trip',
    currency: 'Kč',
    createdAt: '2025-08-24T00:00:00.000Z',
    updatedAt: '2025-08-24T00:00:00.000Z',

    // Fixed price on purpose: at the real pump price the receipts come to far
    // more than the mileage accounts for, and the app should say so out loud.
    // Switch to `from-receipts` to see the whole 6 893,73 Kč divided instead.
    pricing: { mode: 'fixed-price', pricePerUnit: fromMajor(43) },
    // Whether the van ran on petrol or diesel is not recorded. It changes
    // nothing here: the unit is litres either way and the price is stated
    // outright, so this is only the label on the field.
    energyKind: 'gasoline',
    consumptionPer100Km: 9.5,
    // Nobody was billed for the van itself, only for what went into it.
    maintenancePerKm: 0,
    rounding: 'nearest',
    currencyCode: 'CZK',
    paidAt: {},
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
      drive('d1', 'Šumperk', 'Olomouc', 59.7, ['matthew']),
      drive('d2', 'Olomouc', 'Milovice', 223.3, ['matthew', 'terka', 'janca', 'anet']),
      idleStop('i1', 'Milovice', 20, ['matthew', 'terka', 'janca', 'anet', 'lucis', 'vena']),
      drive('d3', 'Milovice', 'Olomouc', 223.2, ['matthew', 'terka', 'janca', 'anet', 'lucis', 'vena']),
      drive('d4', 'Olomouc', 'Vsetín', 91, ['matthew', 'terka', 'janca']),
      drive('d5', 'Vsetín', 'Kunčice', 43.3, ['matthew', 'terka', 'janca', 'lucis', 'ondrej', 'maruska']),
      drive('d6', 'Kunčice', 'Olomouc', 93.7, ['matthew', 'terka', 'lucis']),
      drive('d7', 'Olomouc', 'Šumperk', 59.1, ['matthew']),
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
    distanceSource: 'osrm' as const,
    occupantIds,
  }
}

function idleStop(id: string, location: string, energy: number, occupantIds: string[]) {
  return {
    kind: 'idle' as const,
    id,
    label: `Canister burned waiting at ${location}`,
    location,
    energy,
    occupantIds,
  }
}
