import { describe, expect, it } from 'vitest'
import { sumMoney, toMajor } from '../domain/money/money'
import { calculateTrip } from '../domain/trip/calculateTrip'
import { createDemoTrip } from './demoTrip'

/**
 * The golden test. Unlike the one it replaces — which asserted that
 * hand-entered per-leg costs added up to hand-entered per-person totals —
 * every number below is produced from distances and litres by the calculator.
 */
describe('the Volkswagen trip, at a fixed pump price', () => {
  const result = calculateTrip(createDemoTrip())

  it('derives the fuel from the route, not from stated costs', () => {
    expect(result.totalDistanceKm).toBeCloseTo(858.1, 1)
    // 858.1 km at 9.5 L/100km, plus the 20 L canister.
    expect(result.totalLiters).toBeCloseTo(101.5195, 4)
    expect(toMajor(result.fuelTotal)).toBe(4365.34)
  })

  it('splits it as follows', () => {
    expect(payableByName(result)).toEqual({
      Matthew: 1364,
      Terka: 859,
      Janča: 732,
      Anet: 562,
      Lucis: 471,
      Véna: 311,
      Ondřej: 33,
      Maruška: 33,
    })
  })

  it('shows Matthew the 2 528 Kč the old model let him quietly absorb', () => {
    expect(toMajor(result.receiptsTotal)).toBe(6893.73)
    expect(toMajor(result.receiptsDelta)).toBe(2528.39)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('driver')
  })

  it('collects exactly what it bills', () => {
    expect(result.driverPayable + result.collectFromOthers).toBe(result.totalPayable)
    expect(toMajor(result.collectFromOthers)).toBe(3001)
  })
})

describe('the same trip, priced from the receipts', () => {
  const result = calculateTrip({ ...createDemoTrip(), pricing: { mode: 'from-receipts' } })

  it('leaves nothing on the table', () => {
    expect(result.fuelTotal).toBe(result.receiptsTotal)
    expect(result.receiptsDelta).toBe(0)
    expect(result.warnings).toEqual([])
  })

  it('derives a price per litre well above the pump price, which is the point', () => {
    // 6 893,73 Kč of fuel against 101,5 L of mileage. Either the van drank
    // more than 9,5 L/100 km or the tank did not start empty — either way,
    // the app now says so instead of hiding it.
    expect(toMajor(result.derivedPricePerLiter)).toBe(67.91)
  })

  it('splits the full amount as follows', () => {
    expect(payableByName(result)).toEqual({
      Matthew: 2159,
      Terka: 1356,
      Janča: 1155,
      Anet: 888,
      Lucis: 743,
      Véna: 491,
      Ondřej: 51,
      Maruška: 51,
    })
  })

  it('adds up to the receipts, to the crown', () => {
    expect(sumMoney(result.people.map((person) => person.payable))).toBe(result.totalPayable)
    expect(Math.abs(toMajor(result.roundingResidual))).toBeLessThan(1)
    expect(toMajor(result.totalPayable)).toBe(6894)
  })
})

describe('both modes', () => {
  it('charge the two people who only rode the short leg the least', () => {
    for (const mode of ['fixed-price', 'from-receipts'] as const) {
      const trip = createDemoTrip()
      const result = calculateTrip({
        ...trip,
        pricing: mode === 'from-receipts' ? { mode } : trip.pricing,
      })
      const sorted = [...result.people].sort((a, b) => a.payable - b.payable)
      expect(
        sorted
          .slice(0, 2)
          .map((person) => person.name)
          .sort(),
      ).toEqual(['Maruška', 'Ondřej'])
    }
  })

  it('bill the driver the most, since he rode every leg', () => {
    const result = calculateTrip(createDemoTrip())
    const top = [...result.people].sort((a, b) => b.payable - a.payable)[0]
    expect(top?.name).toBe('Matthew')
  })
})

function payableByName(result: ReturnType<typeof calculateTrip>): Record<string, number> {
  return Object.fromEntries(
    [...result.people]
      .sort((a, b) => b.payable - a.payable)
      .map((person) => [person.name, toMajor(person.payable)]),
  )
}
