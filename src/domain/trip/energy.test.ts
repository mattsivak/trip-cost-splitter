import { describe, expect, it } from 'vitest'
import { energyForSegment, totalDistanceKm, totalEnergy } from './energy'
import type { DriveLine, StopLine, Trip } from './types'

const trip: Pick<Trip, 'consumptionPer100Km'> = { consumptionPer100Km: 9.5 }

function drive(overrides: Partial<DriveLine> = {}): DriveLine {
  return {
    kind: 'drive',
    id: 'd1',
    label: 'A → B',
    from: 'A',
    to: 'B',
    distanceKm: 100,
    distanceSource: 'manual',
    occupantIds: [],
    ...overrides,
  }
}

function idle(overrides: Partial<StopLine> = {}): StopLine {
  return { kind: 'stop', id: 'i1', label: 'Waiting', energy: 8, occupantIds: [], ...overrides }
}

describe('energyForSegment', () => {
  it('derives drive litres from distance and the trip default consumption', () => {
    expect(energyForSegment(drive({ distanceKm: 246.2 }), trip)).toBeCloseTo(23.389, 3)
  })

  it('prefers a per-segment consumption figure over the trip default', () => {
    expect(energyForSegment(drive({ distanceKm: 100, consumptionPer100Km: 12 }), trip)).toBe(12)
  })

  it('lets a measured litre figure win over the distance calculation', () => {
    expect(energyForSegment(drive({ distanceKm: 100, directEnergy: 4 }), trip)).toBe(4)
  })

  it('uses idle litres directly', () => {
    expect(energyForSegment(idle({ energy: 8.5 }), trip)).toBe(8.5)
  })

  it('treats missing, negative and non-finite quantities as zero', () => {
    expect(energyForSegment(drive({ distanceKm: -50 }), trip)).toBe(0)
    expect(energyForSegment(drive({ distanceKm: Number.NaN }), trip)).toBe(0)
    expect(energyForSegment(idle({ energy: -3 }), trip)).toBe(0)
  })
})

describe('totals', () => {
  const full = {
    consumptionPer100Km: 10,
    lines: [drive({ distanceKm: 100 }), drive({ id: 'd2', distanceKm: 50 }), idle({ energy: 5 })],
  }

  it('sums litres across drives and idle stops', () => {
    expect(totalEnergy(full)).toBe(20)
  })

  it('counts only drives toward distance', () => {
    expect(totalDistanceKm(full)).toBe(150)
  })
})
