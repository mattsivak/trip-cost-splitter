import { describe, expect, it } from 'vitest'
import { litersForSegment, totalDistanceKm, totalLiters } from './fuel'
import type { DriveSegment, IdleSegment, Trip } from './types'

const trip: Pick<Trip, 'defaultConsumptionLPer100Km'> = { defaultConsumptionLPer100Km: 9.5 }

function drive(overrides: Partial<DriveSegment> = {}): DriveSegment {
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

function idle(overrides: Partial<IdleSegment> = {}): IdleSegment {
  return { kind: 'idle', id: 'i1', label: 'Waiting', liters: 8, occupantIds: [], ...overrides }
}

describe('litersForSegment', () => {
  it('derives drive litres from distance and the trip default consumption', () => {
    expect(litersForSegment(drive({ distanceKm: 246.2 }), trip)).toBeCloseTo(23.389, 3)
  })

  it('prefers a per-segment consumption figure over the trip default', () => {
    expect(litersForSegment(drive({ distanceKm: 100, consumptionLPer100Km: 12 }), trip)).toBe(12)
  })

  it('lets a measured litre figure win over the distance calculation', () => {
    expect(litersForSegment(drive({ distanceKm: 100, directLiters: 4 }), trip)).toBe(4)
  })

  it('uses idle litres directly', () => {
    expect(litersForSegment(idle({ liters: 8.5 }), trip)).toBe(8.5)
  })

  it('treats missing, negative and non-finite quantities as zero', () => {
    expect(litersForSegment(drive({ distanceKm: -50 }), trip)).toBe(0)
    expect(litersForSegment(drive({ distanceKm: Number.NaN }), trip)).toBe(0)
    expect(litersForSegment(idle({ liters: -3 }), trip)).toBe(0)
  })
})

describe('totals', () => {
  const full = {
    defaultConsumptionLPer100Km: 10,
    segments: [drive({ distanceKm: 100 }), drive({ id: 'd2', distanceKm: 50 }), idle({ liters: 5 })],
  }

  it('sums litres across drives and idle stops', () => {
    expect(totalLiters(full)).toBe(20)
  })

  it('counts only drives toward distance', () => {
    expect(totalDistanceKm(full)).toBe(150)
  })
})
